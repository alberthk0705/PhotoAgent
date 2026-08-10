import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  LAYOUTS,
  MAX_ZOOM,
  cellGeometry,
  cellRects,
  clampZoom,
  focalPointForBox,
  minZoom,
  renderComposite,
  zoomCellAt,
} from '../lib/compose.js'
import { canvasToBlob, downloadBlob } from '../lib/images.js'
import { stampFromInputValue } from '../lib/exif.js'
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

const clamp01 = (n) => Math.min(1, Math.max(0, n))

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
  const previewRef = useRef(null)
  const pointers = useRef(new Map()) // live pointers, so two fingers can pinch
  const gesture = useRef(null)
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

  // Wheel/trackpad zoom. Registered natively because it must call
  // preventDefault, and React's onWheel is passive.
  useEffect(() => {
    const el = previewRef.current
    if (!el) return

    const onWheel = (e) => {
      const b = el.getBoundingClientRect()
      const px = (e.clientX - b.left) / scale
      const py = (e.clientY - b.top) / scale
      const index = rects.findIndex((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)
      if (index === -1) return
      const cell = cells[index]
      const photo = cell?.photoId ? photos.find((p) => p.id === cell.photoId) : null
      if (!photo) return

      e.preventDefault()
      onSelect(index)
      const factor = Math.exp(-e.deltaY * 0.002)
      onCellChange(index, zoomCellAt(photo.img, rects[index], cell, (cell.zoom ?? 1) * factor, px, py))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [rects, scale, cells, photos, onCellChange, onSelect])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    renderComposite(canvas, spec, Math.min(scale * dpr, 4))
  }, [spec, scale])

  const filled = cells.filter((c) => c.photoId).length
  const cell = cells[selected]
  const cellPhoto = cell?.photoId ? photos.find((p) => p.id === cell.photoId) : null

  /** Screen coordinates → output-image coordinates. */
  function toOutput(clientX, clientY) {
    const b = previewRef.current.getBoundingClientRect()
    return { px: (clientX - b.left) / scale, py: (clientY - b.top) / scale }
  }

  function photoFor(index) {
    const c = cells[index]
    return c?.photoId ? photos.find((p) => p.id === c.photoId) : null
  }

  function beginDrag(e, index) {
    onSelect(index)
    const c = cells[index]
    const photo = photoFor(index)
    const rect = rects[index]
    if (!photo || !rect) return

    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // Second finger down turns the drag into a pinch.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        mode: 'pinch',
        index,
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startZoom: c.zoom ?? 1,
      }
      return
    }

    const geom = cellGeometry(photo.img, rect.w, rect.h, c)
    if (geom.panX < 0.5 && geom.panY < 0.5) return // fits exactly; nothing to pan
    gesture.current = {
      mode: 'pan',
      index,
      x: e.clientX,
      y: e.clientY,
      fx: c.fx,
      fy: c.fy,
      // Screen pixels → fraction of the pannable range.
      kx: geom.panX > 0 ? 1 / (scale * geom.panX) : 0,
      ky: geom.panY > 0 ? 1 / (scale * geom.panY) : 0,
    }
  }

  function onDragMove(e) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const g = gesture.current
    if (!g) return

    if (g.mode === 'pinch') {
      if (pointers.current.size < 2) return
      const [a, b] = [...pointers.current.values()]
      const photo = photoFor(g.index)
      const rect = rects[g.index]
      if (!photo || !rect) return
      const { px, py } = toOutput((a.x + b.x) / 2, (a.y + b.y) / 2)
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / g.startDist
      onCellChange(g.index, zoomCellAt(photo.img, rect, cells[g.index], g.startZoom * ratio, px, py))
      return
    }

    const fx = g.kx ? clamp01(g.fx - (e.clientX - g.x) * g.kx) : g.fx
    const fy = g.ky ? clamp01(g.fy - (e.clientY - g.y) * g.ky) : g.fy
    onCellChange(g.index, { fx, fy })
  }

  function endDrag(e) {
    pointers.current.delete(e.pointerId)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    // A pinch ends when either finger leaves; don't silently become a pan.
    if (pointers.current.size === 0 || gesture.current?.mode === 'pinch') gesture.current = null
  }

  /** Slider and buttons zoom about the cell centre. */
  function setZoom(index, zoom) {
    const photo = photoFor(index)
    const rect = rects[index]
    if (!photo || !rect) return
    onCellChange(index, zoomCellAt(photo.img, rect, cells[index], zoom, rect.x + rect.w / 2, rect.y + rect.h / 2))
  }

  /**
   * Point the selected cell at `target`. When the picker offers "fit all heads"
   * it also passes the full list, so we can fall back to the largest head if the
   * group is simply wider or taller than the cell can show.
   */
  function frameBox(target, allHeads) {
    const rect = rects[selected]
    if (!rect || !cellPhoto) return

    const geom = cellGeometry(cellPhoto.img, rect.w, rect.h, cell)
    let picked = target
    let message = ''
    // Compare in output pixels: at higher zoom, less of the photo fits.
    if (allHeads?.length && (target.w * geom.scale > rect.w || target.h * geom.scale > rect.h)) {
      picked = allHeads[0] // sorted largest first
      message = t('headsDontFit', { n: allHeads.length })
    }

    onCellChange(selected, focalPointForBox(picked, rect, geom))
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
            <div
              ref={previewRef}
              className="checkerboard no-callout relative shadow-2xl shadow-black/50"
              style={{ width: dispW, height: dispH }}
            >
              <canvas ref={canvasRef} style={{ width: dispW, height: dispH }} className="block" />

              {rects.map((r, i) => {
                const c = cells[i]
                const hasPhoto = Boolean(c?.photoId)
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
                      cursor: hasPhoto ? 'grab' : 'pointer',
                    }}
                    className={`absolute flex items-center justify-center overflow-hidden transition-shadow ${
                      // Without touch-action:none a touch-drag scrolls the page
                      // instead of panning, and a pinch zooms the page instead of
                      // the photo. Empty cells keep the gesture so they can scroll.
                      hasPhoto ? 'touch-none' : ''
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
                {cellPhoto ? t('dragHint') : ''}
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
                    onClick={() =>
                      onCellChange(selected, {
                        fit: value,
                        zoom: clampZoom({ ...cell, fit: value }, cell.zoom ?? 1),
                      })
                    }
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

              <Field label={t('zoomLabel', { n: (cell.zoom ?? 1).toFixed(1) })}>
                <input
                  type="range"
                  aria-label="zoom"
                  min={minZoom(cell)}
                  max={MAX_ZOOM}
                  step={0.1}
                  value={cell.zoom ?? 1}
                  onChange={(e) => setZoom(selected, +e.target.value)}
                  className="w-full"
                />
              </Field>

              <div className="flex gap-2">
                <button
                  onClick={() => onCellChange(selected, { fx: 0.5, fy: 0.5, zoom: 1 })}
                  className="flex-1 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300 transition hover:border-neutral-600"
                >
                  {t('resetView')}
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
