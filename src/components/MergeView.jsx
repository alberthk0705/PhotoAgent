import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LAYOUTS, cellRects, coverSourceRect, renderComposite } from '../lib/compose.js'
import { canvasToBlob, downloadBlob } from '../lib/images.js'
import { stampFromInputValue } from '../lib/exif.js'
import { focalPointFor } from '../lib/faces.js'
import { useT } from '../lib/i18n.jsx'
import HeadPicker from './HeadPicker.jsx'

const PRESETS = [
  { w: 1080, h: 1080, noteKey: 'presetSquare' },
  { w: 1920, h: 1080, note: '16:9' },
  { w: 1080, h: 1920, note: '9:16' },
  { w: 2048, h: 1536, note: '4:3' },
  { w: 3000, h: 2000, note: '3:2' },
]

const SWATCHES = ['#ffffff', '#000000', '#f5f5f4', '#1c1917', '#e11d48', '#2563eb']
const DATE_SWATCHES = ['#ff9d2e', '#ffffff', '#000000', '#f43f5e', '#22d3ee']

const CORNERS = [
  ['tl', 'cornerTL'],
  ['tr', 'cornerTR'],
  ['bl', 'cornerBL'],
  ['br', 'cornerBR'],
]

const MIN_SIZE = 16
const MAX_SIZE = 8000

function LayoutGlyph({ layout, active }) {
  const { rows, cols } = LAYOUTS[layout]
  return (
    <div
      className="grid gap-[1.5px]"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: 24,
        height: 24,
      }}
    >
      {Array.from({ length: rows * cols }, (_, i) => (
        <span key={i} className={`rounded-[1px] ${active ? 'bg-white' : 'bg-neutral-500'}`} />
      ))}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
    </label>
  )
}

export default function MergeView({
  photos,
  layout,
  onLayoutChange,
  cells,
  onCellChange,
  selected,
  onSelect,
  output,
  onOutputChange,
  gap,
  onGapChange,
  padding,
  onPaddingChange,
  bgColor,
  onBgColorChange,
  date,
  onDateChange,
}) {
  const { t } = useT()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const dragRef = useRef(null)
  const [box, setBox] = useState({ w: 640, h: 420 })
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [note, setNote] = useState('')

  // Size fields hold raw text while typing. Clamping on every keystroke made it
  // impossible to type any value whose prefix falls below the minimum — "200"
  // became "16" the moment you typed "2".
  const [sizeText, setSizeText] = useState({ w: String(output.width), h: String(output.height) })
  useEffect(() => {
    setSizeText({ w: String(output.width), h: String(output.height) })
  }, [output.width, output.height])

  function commitSize(field) {
    const raw = parseInt(sizeText[field === 'width' ? 'w' : 'h'], 10)
    const next = Number.isFinite(raw) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, raw)) : output[field]
    onOutputChange({ ...output, [field]: next })
    setSizeText((prev) => ({ ...prev, [field === 'width' ? 'w' : 'h']: String(next) }))
  }

  const spec = useMemo(
    () => ({
      layout,
      cells,
      photos,
      width: output.width,
      height: output.height,
      gap,
      padding,
      bgColor,
      date,
    }),
    [layout, cells, photos, output.width, output.height, gap, padding, bgColor, date],
  )

  const rects = useMemo(
    () => cellRects({ layout, width: output.width, height: output.height, gap, padding }),
    [layout, output.width, output.height, gap, padding],
  )

  // Fit the preview to whatever space the panel leaves us.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = Math.max(0.02, Math.min(3, (box.w - 8) / output.width, (box.h - 8) / output.height))
  const dispW = Math.round(output.width * scale)
  const dispH = Math.round(output.height * scale)

  // The fallback notice belongs to one cell; move on and it's stale.
  useEffect(() => setNote(''), [selected, layout])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    renderComposite(canvas, spec, Math.min(scale * dpr, 4))
  }, [spec, scale])

  const filled = cells.filter((c) => c.photoId).length
  const cell = cells[selected]
  const cellPhoto = cell?.photoId ? photos.find((p) => p.id === cell.photoId) : null

  function beginDrag(e, index) {
    onSelect(index)
    const c = cells[index]
    const photo = c?.photoId ? photos.find((p) => p.id === c.photoId) : null
    const rect = rects[index]
    if (!photo || !rect || c.fit !== 'cover') return

    const { sw, sh } = coverSourceRect(photo.img, rect.w, rect.h, c.fx, c.fy)
    const rangeX = photo.img.naturalWidth - sw
    const rangeY = photo.img.naturalHeight - sh
    if (rangeX < 1 && rangeY < 1) return // photo matches the cell exactly, nothing to pan

    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      index,
      x: e.clientX,
      y: e.clientY,
      fx: c.fx,
      fy: c.fy,
      // Screen pixels → fraction of the pannable range.
      kx: rangeX > 0 ? sw / rect.w / (scale * rangeX) : 0,
      ky: rangeY > 0 ? sh / rect.h / (scale * rangeY) : 0,
    }
  }

  function onDragMove(e) {
    const d = dragRef.current
    if (!d) return
    const fx = d.kx ? Math.min(1, Math.max(0, d.fx - (e.clientX - d.x) * d.kx)) : d.fx
    const fy = d.ky ? Math.min(1, Math.max(0, d.fy - (e.clientY - d.y) * d.ky)) : d.fy
    onCellChange(d.index, { fx, fy })
  }

  function endDrag(e) {
    if (dragRef.current) e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragRef.current = null
  }

  /**
   * Point the selected cell at `target`. When the picker offers "fit all heads"
   * it also passes the full list, so we can fall back to the largest head if the
   * group is simply wider or taller than the cell can show.
   */
  function frameBox(target, allHeads) {
    const rect = rects[selected]
    if (!rect || !cellPhoto) return

    const { sw, sh } = coverSourceRect(cellPhoto.img, rect.w, rect.h, cell.fx, cell.fy)
    let picked = target
    let message = ''
    if (allHeads?.length && (target.w > sw || target.h > sh)) {
      picked = allHeads[0] // sorted largest first
      message = t('headsDontFit', { n: allHeads.length })
    }

    onCellChange(selected, focalPointFor(picked, cellPhoto.width, cellPhoto.height, sw, sh))
    setNote(message)
    setPicking(false)
  }

  async function exportImage() {
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      renderComposite(canvas, spec, 1)
      const blob = await canvasToBlob(canvas, 'image/png')
      if (blob) downloadBlob(blob, `merged-${layout}-${output.width}x${output.height}.png`)
    } finally {
      setBusy(false)
    }
  }

  const sizeInputClass =
    'w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500'

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0 lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col p-4 lg:p-5">
        <div ref={wrapRef} className="flex min-h-[42vh] flex-1 items-center justify-center lg:min-h-0">
          {rects.length === 0 ? (
            <p className="max-w-xs text-center text-xs text-neutral-500">{t('gapTooLarge')}</p>
          ) : (
            <div className="checkerboard no-callout relative shadow-2xl shadow-black/50" style={{ width: dispW, height: dispH }}>
              <canvas ref={canvasRef} style={{ width: dispW, height: dispH }} className="block" />

              {rects.map((r, i) => {
                const c = cells[i]
                const hasPhoto = Boolean(c?.photoId)
                const pannable = hasPhoto && c.fit === 'cover'
                const roomForLabel = r.w * scale > 96 && r.h * scale > 28
                return (
                  <div
                    key={i}
                    data-cell-index={i}
                    onPointerDown={(e) => beginDrag(e, i)}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    style={{
                      left: r.x * scale,
                      top: r.y * scale,
                      width: r.w * scale,
                      height: r.h * scale,
                      cursor: pannable ? 'grab' : 'pointer',
                    }}
                    className={`absolute flex items-center justify-center overflow-hidden transition-shadow ${
                      // Without touch-action:none a touch-drag scrolls the page
                      // instead of panning. Only claim the gesture where panning
                      // is actually possible, so empty cells still scroll.
                      pannable ? 'touch-none' : ''
                    } ${
                      selected === i
                        ? 'shadow-[inset_0_0_0_2px_rgb(99_102_241)]'
                        : 'hover:shadow-[inset_0_0_0_2px_rgb(99_102_241/0.4)]'
                    }`}
                  >
                    {!hasPhoto && roomForLabel && (
                      <span className="pointer-events-none rounded bg-black/55 px-2 py-1 text-[11px] text-neutral-300">
                        {t('cellEmptyBadge', { n: i + 1 })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <footer className="mt-4 flex items-center gap-4">
          <button
            onClick={exportImage}
            disabled={filled === 0 || busy || rects.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {busy ? t('rendering') : t('exportPng')}
          </button>
          <span className="text-[11px] text-neutral-500">
            {note ? (
              <span className="text-amber-400">{note}</span>
            ) : (
              <>
                {t('cellsFilled', {
                  filled,
                  total: cells.length,
                  w: output.width,
                  h: output.height,
                })}
                {cellPhoto && cell.fit === 'cover' ? t('dragHint') : ''}
              </>
            )}
          </span>
        </footer>
      </section>

      <aside className="w-full shrink-0 space-y-6 border-t border-neutral-800 bg-neutral-950 p-4 lg:w-72 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <Field label={t('layout')}>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.keys(LAYOUTS).map((key) => (
              <button
                key={key}
                onClick={() => onLayoutChange(key)}
                title={LAYOUTS[key].label}
                className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${
                  layout === key
                    ? 'border-indigo-500 bg-indigo-600/15'
                    : 'border-neutral-800 hover:border-neutral-600'
                }`}
              >
                <LayoutGlyph layout={key} active={layout === key} />
                <span className={`text-[9px] ${layout === key ? 'text-indigo-200' : 'text-neutral-500'}`}>
                  {LAYOUTS[key].label}
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('outputSize')}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={sizeText.w}
              aria-label="width"
              onChange={(e) => setSizeText((p) => ({ ...p, w: e.target.value }))}
              onBlur={() => commitSize('width')}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className={sizeInputClass}
            />
            <span className="text-xs text-neutral-600">×</span>
            <input
              type="text"
              inputMode="numeric"
              value={sizeText.h}
              aria-label="height"
              onChange={(e) => setSizeText((p) => ({ ...p, h: e.target.value }))}
              onBlur={() => commitSize('height')}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className={sizeInputClass}
            />
            <button
              onClick={() => onOutputChange({ width: output.height, height: output.width })}
              title={t('swapSides')}
              className="rounded-md border border-neutral-800 px-2 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
            >
              ⇄
            </button>
          </div>
          <select
            value=""
            onChange={(e) => {
              const p = PRESETS[+e.target.value]
              if (p) onOutputChange({ width: p.w, height: p.h })
            }}
            className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-400 outline-none focus:border-indigo-500"
          >
            <option value="">{t('presets')}</option>
            {PRESETS.map((p, i) => (
              <option key={`${p.w}x${p.h}`} value={i}>
                {p.w} × {p.h} · {p.noteKey ? t(p.noteKey) : p.note}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-neutral-600">{t('sizeRange', { min: MIN_SIZE, max: MAX_SIZE })}</p>
        </Field>

        <Field label={t('gapLabel', { n: gap })}>
          <input type="range" min={0} max={200} value={gap} onChange={(e) => onGapChange(+e.target.value)} className="w-full" />
        </Field>

        <Field label={t('borderLabel', { n: padding })}>
          <input
            type="range"
            min={0}
            max={200}
            value={padding}
            onChange={(e) => onPaddingChange(+e.target.value)}
            className="w-full"
          />
        </Field>

        <Field label={t('borderColour')}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => onBgColorChange(e.target.value)}
              className="h-8 w-10 rounded-md"
            />
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => onBgColorChange(c)}
                title={c}
                style={{ background: c }}
                className={`h-6 w-6 rounded-md border transition ${
                  bgColor.toLowerCase() === c ? 'border-indigo-400' : 'border-neutral-700 hover:border-neutral-500'
                }`}
              />
            ))}
          </div>
        </Field>

        {/* ---- date stamp ---- */}
        <div className="space-y-3 border-t border-neutral-800 pt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={date.enabled}
              onChange={(e) => onDateChange({ enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-indigo-500"
            />
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{t('dateStamp')}</span>
          </label>

          {date.enabled && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label={t('dateValue')}
                  value={date.text ? date.text.replace(/\./g, '-') : ''}
                  onChange={(e) => onDateChange({ text: stampFromInputValue(e.target.value) })}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => onDateChange({ text: '' })}
                  title={t('clear')}
                  className="rounded-md border border-neutral-800 px-2 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
                >
                  ✕
                </button>
              </div>
              <p className="font-mono text-[11px] text-neutral-400">{date.text || '—'}</p>

              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={t('dateColour')}
                  value={date.color}
                  onChange={(e) => onDateChange({ color: e.target.value })}
                  className="h-8 w-10 rounded-md"
                />
                {DATE_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => onDateChange({ color: c })}
                    title={c}
                    style={{ background: c }}
                    className={`h-6 w-6 rounded-md border transition ${
                      date.color.toLowerCase() === c ? 'border-indigo-400' : 'border-neutral-700 hover:border-neutral-500'
                    }`}
                  />
                ))}
              </div>

              <div>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  {t('dateCorner')}
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {CORNERS.map(([value, key]) => (
                    <button
                      key={value}
                      onClick={() => onDateChange({ corner: value })}
                      className={`rounded-md border px-2 py-1.5 text-[11px] transition ${
                        date.corner === value
                          ? 'border-indigo-500 bg-indigo-600/15 text-indigo-200'
                          : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                      }`}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>

              <Field label={t('dateMargin', { n: date.margin })}>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={date.margin}
                  onChange={(e) => onDateChange({ margin: +e.target.value })}
                  className="w-full"
                />
              </Field>

              <Field label={t('dateSize', { n: date.size })}>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={0.5}
                  value={date.size}
                  onChange={(e) => onDateChange({ size: +e.target.value })}
                  className="w-full"
                />
              </Field>

              <p className="text-[10px] leading-snug text-neutral-600">{t('dateHelp')}</p>
            </>
          )}
        </div>

        {/* ---- selected cell ---- */}
        <div className="space-y-3 border-t border-neutral-800 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            {t('cellOf', { n: selected + 1, m: cells.length })}
          </p>

          {cellPhoto ? (
            <>
              <p className="truncate text-xs text-neutral-300" title={cellPhoto.name}>
                {cellPhoto.name}
              </p>

              <div className="flex gap-1 rounded-lg bg-neutral-900 p-1">
                {[
                  ['cover', t('cover')],
                  ['contain', t('contain')],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => onCellChange(selected, { fit: value })}
                    className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                      cell.fit === value ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-neutral-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] leading-snug text-neutral-600">
                {cell.fit === 'cover' ? t('coverHelp') : t('containHelp')}
              </p>

              <button
                onClick={() => setPicking(true)}
                disabled={cell.fit !== 'cover'}
                title={cell.fit === 'cover' ? t('detectHeadsCoverTitle') : t('detectHeadsContainTitle')}
                className="w-full rounded-md border border-emerald-800 bg-emerald-600/10 px-2 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:border-emerald-600 disabled:opacity-40"
              >
                {t('detectHeadsMenu')}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => onCellChange(selected, { fx: 0.5, fy: 0.5 })}
                  disabled={cell.fit !== 'cover'}
                  className="flex-1 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300 transition hover:border-neutral-600 disabled:opacity-40"
                >
                  {t('recentre')}
                </button>
                <button
                  onClick={() => onCellChange(selected, { photoId: null })}
                  className="flex-1 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300 transition hover:border-red-800 hover:text-red-300"
                >
                  {t('clear')}
                </button>
              </div>
            </>
          ) : (
            <p className="text-[11px] leading-snug text-neutral-600">{t('emptyCellHint')}</p>
          )}
        </div>
      </aside>

      {picking && cellPhoto && (
        <HeadPicker photo={cellPhoto} onChoose={frameBox} onClose={() => setPicking(false)} />
      )}
    </div>
  )
}
