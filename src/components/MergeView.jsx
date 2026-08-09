import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LAYOUTS, cellRects, coverSourceRect, renderComposite } from '../lib/compose.js'
import { canvasToBlob, downloadBlob } from '../lib/images.js'
import { focalPointFor } from '../lib/faces.js'
import HeadPicker from './HeadPicker.jsx'

const PRESETS = [
  { label: '1080 × 1080 · square', w: 1080, h: 1080 },
  { label: '1920 × 1080 · 16:9', w: 1920, h: 1080 },
  { label: '1080 × 1920 · 9:16', w: 1080, h: 1920 },
  { label: '2048 × 1536 · 4:3', w: 2048, h: 1536 },
  { label: '3000 × 2000 · 3:2', w: 3000, h: 2000 },
]

const SWATCHES = ['#ffffff', '#000000', '#f5f5f4', '#1c1917', '#e11d48', '#2563eb']

const MIN_SIZE = 16
const MAX_SIZE = 8000
const clampSize = (n) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n) || MIN_SIZE))

function LayoutGlyph({ layout, active }) {
  const { rows, cols } = LAYOUTS[layout]
  return (
    <div
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, width: 26, height: 26 }}
    >
      {Array.from({ length: rows * cols }, (_, i) => (
        <span key={i} className={`rounded-[2px] ${active ? 'bg-white' : 'bg-neutral-500'}`} />
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
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const dragRef = useRef(null)
  const [box, setBox] = useState({ w: 640, h: 420 })
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [note, setNote] = useState('')

  const spec = useMemo(
    () => ({ layout, cells, photos, width: output.width, height: output.height, gap, padding, bgColor }),
    [layout, cells, photos, output.width, output.height, gap, padding, bgColor],
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

  const scale = Math.max(
    0.02,
    Math.min(3, (box.w - 8) / output.width, (box.h - 8) / output.height),
  )
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
    let box = target
    let message = ''
    if (allHeads?.length && (target.w > sw || target.h > sh)) {
      box = allHeads[0] // sorted largest first
      message = `All ${allHeads.length} heads don't fit this cell — framed the largest instead.`
    }

    onCellChange(selected, focalPointFor(box, cellPhoto.width, cellPhoto.height, sw, sh))
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

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col p-5">
        <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center">
          {rects.length === 0 ? (
            <p className="max-w-xs text-center text-xs text-neutral-500">
              The gap and border are larger than the output size — reduce them, or make the output bigger.
            </p>
          ) : (
            <div className="checkerboard relative shadow-2xl shadow-black/50" style={{ width: dispW, height: dispH }}>
              <canvas ref={canvasRef} style={{ width: dispW, height: dispH }} className="block" />

              {rects.map((r, i) => {
                const c = cells[i]
                const hasPhoto = Boolean(c?.photoId)
                const pannable = hasPhoto && c.fit === 'cover'
                return (
                  <div
                    key={i}
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
                    className={`absolute flex items-center justify-center transition-shadow ${
                      selected === i
                        ? 'shadow-[inset_0_0_0_2px_rgb(99_102_241)]'
                        : 'hover:shadow-[inset_0_0_0_2px_rgb(99_102_241/0.4)]'
                    }`}
                  >
                    {!hasPhoto && (
                      <span className="pointer-events-none rounded bg-black/55 px-2 py-1 text-[11px] text-neutral-300">
                        Cell {i + 1} — empty
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
            {busy ? 'Rendering…' : 'Export PNG'}
          </button>
          <span className="text-[11px] text-neutral-500">
            {note ? (
              <span className="text-amber-400">{note}</span>
            ) : (
              <>
                {filled}/{cells.length} cells filled · output {output.width} × {output.height} px
                {cellPhoto && cell.fit === 'cover' ? ' · drag a photo to reposition it' : ''}
              </>
            )}
          </span>
        </footer>
      </section>

      <aside className="w-72 shrink-0 space-y-6 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4">
        <Field label="Layout">
          <div className="flex gap-2">
            {Object.keys(LAYOUTS).map((key) => (
              <button
                key={key}
                onClick={() => onLayoutChange(key)}
                title={LAYOUTS[key].label}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition ${
                  layout === key
                    ? 'border-indigo-500 bg-indigo-600/15'
                    : 'border-neutral-800 hover:border-neutral-600'
                }`}
              >
                <LayoutGlyph layout={key} active={layout === key} />
                <span className={`text-[10px] ${layout === key ? 'text-indigo-200' : 'text-neutral-500'}`}>
                  {LAYOUTS[key].label}
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Output size (px)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={output.width}
              min={MIN_SIZE}
              max={MAX_SIZE}
              onChange={(e) => onOutputChange({ ...output, width: clampSize(+e.target.value) })}
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500"
            />
            <span className="text-xs text-neutral-600">×</span>
            <input
              type="number"
              value={output.height}
              min={MIN_SIZE}
              max={MAX_SIZE}
              onChange={(e) => onOutputChange({ ...output, height: clampSize(+e.target.value) })}
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => onOutputChange({ width: output.height, height: output.width })}
              title="Swap width and height"
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
            <option value="">Presets…</option>
            {PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Gap between cells — ${gap} px`}>
          <input
            type="range"
            min={0}
            max={200}
            value={gap}
            onChange={(e) => onGapChange(+e.target.value)}
            className="w-full"
          />
        </Field>

        <Field label={`Outer border — ${padding} px`}>
          <input
            type="range"
            min={0}
            max={200}
            value={padding}
            onChange={(e) => onPaddingChange(+e.target.value)}
            className="w-full"
          />
        </Field>

        <Field label="Border colour">
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

        <div className="space-y-3 border-t border-neutral-800 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Cell {selected + 1} of {cells.length}
          </p>

          {cellPhoto ? (
            <>
              <p className="truncate text-xs text-neutral-300" title={cellPhoto.name}>
                {cellPhoto.name}
              </p>

              <div className="flex gap-1 rounded-lg bg-neutral-900 p-1">
                {[
                  ['cover', 'Cover'],
                  ['contain', 'Contain'],
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
                {cell.fit === 'cover'
                  ? 'Fills the cell and crops the overflow. Drag the photo in the preview to choose what stays.'
                  : 'Shows the whole photo; spare room is filled with the border colour.'}
              </p>

              <button
                onClick={() => setPicking(true)}
                disabled={cell.fit !== 'cover'}
                title={
                  cell.fit === 'cover'
                    ? 'Find heads in this photo and centre one in the cell'
                    : 'Only applies to Cover cells — Contain already shows the whole photo'
                }
                className="w-full rounded-md border border-emerald-800 bg-emerald-600/10 px-2 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:border-emerald-600 disabled:opacity-40"
              >
                Detect heads…
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => onCellChange(selected, { fx: 0.5, fy: 0.5 })}
                  disabled={cell.fit !== 'cover'}
                  className="flex-1 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300 transition hover:border-neutral-600 disabled:opacity-40"
                >
                  Recentre
                </button>
                <button
                  onClick={() => onCellChange(selected, { photoId: null })}
                  className="flex-1 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300 transition hover:border-red-800 hover:text-red-300"
                >
                  Clear
                </button>
              </div>
            </>
          ) : (
            <p className="text-[11px] leading-snug text-neutral-600">
              This cell is empty. Click a photo in the library to place it here.
            </p>
          )}
        </div>
      </aside>

      {picking && cellPhoto && (
        <HeadPicker photo={cellPhoto} onChoose={frameBox} onClose={() => setPicking(false)} />
      )}
    </div>
  )
}
