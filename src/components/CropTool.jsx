import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.jsx'
import { baseName, canvasToBlob, downloadBlob, photoFromBlob } from '../lib/images.js'
import { padBox, unionBox } from '../lib/faces.js'
import { useHeadDetection } from '../lib/useHeadDetection.js'

// Breathing room added around a detected head before it becomes a crop.
const HEAD_PADDING = 0.3

const MIN = 10 // smallest crop, in source pixels

const RATIOS = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '9:16', value: 9 / 16 },
]

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

// Which edge/corner stays put while a given handle is dragged.
const ANCHOR = {
  nw: { x: 'right', y: 'bottom' },
  n: { x: 'center', y: 'bottom' },
  ne: { x: 'left', y: 'bottom' },
  e: { x: 'left', y: 'center' },
  se: { x: 'left', y: 'top' },
  s: { x: 'center', y: 'top' },
  sw: { x: 'right', y: 'top' },
  w: { x: 'right', y: 'center' },
}

const HANDLE_POS = {
  nw: { left: 0, top: 0, cursor: 'nwse-resize' },
  n: { left: '50%', top: 0, cursor: 'ns-resize' },
  ne: { left: '100%', top: 0, cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: 0, top: '100%', cursor: 'nesw-resize' },
  w: { left: 0, top: '50%', cursor: 'ew-resize' },
}

function centeredRect(imgW, imgH, aspect, fraction = 0.8) {
  let w = imgW * fraction
  let h = imgH * fraction
  if (aspect) {
    if (w / h > aspect) w = h * aspect
    else h = w / aspect
  }
  return { x: (imgW - w) / 2, y: (imgH - h) / 2, w, h }
}

/** Resize `start` by (dx, dy) on `mode`, honouring aspect and the image bounds. */
function resizeRect(mode, start, dx, dy, aspect, imgW, imgH) {
  const l0 = start.x
  const t0 = start.y
  const r0 = start.x + start.w
  const b0 = start.y + start.h
  const cx = l0 + start.w / 2
  const cy = t0 + start.h / 2
  const anchor = ANCHOR[mode]

  let w = start.w + (mode.includes('e') ? dx : mode.includes('w') ? -dx : 0)
  let h = start.h + (mode.includes('s') ? dy : mode.includes('n') ? -dy : 0)

  if (aspect) {
    // Vertical-only handles drive from height; everything else drives from width.
    if (mode === 'n' || mode === 's') w = h * aspect
    else h = w / aspect
  }

  w = Math.max(MIN, w)
  h = Math.max(MIN, h)

  const maxW = anchor.x === 'left' ? imgW - l0 : anchor.x === 'right' ? r0 : 2 * Math.min(cx, imgW - cx)
  const maxH = anchor.y === 'top' ? imgH - t0 : anchor.y === 'bottom' ? b0 : 2 * Math.min(cy, imgH - cy)

  if (aspect) {
    const shrink = Math.min(1, maxW / w, maxH / h)
    w *= shrink
    h *= shrink
  } else {
    w = Math.min(w, maxW)
    h = Math.min(h, maxH)
  }

  const x = anchor.x === 'left' ? l0 : anchor.x === 'right' ? r0 - w : cx - w / 2
  const y = anchor.y === 'top' ? t0 : anchor.y === 'bottom' ? b0 - h : cy - h / 2
  return { x, y, w, h }
}

/** Smallest crop containing `box` that satisfies `aspect` and fits the image. */
function rectFromBox(box, aspect, imgW, imgH) {
  let w = box.w
  let h = box.h
  if (aspect) {
    if (w / h > aspect) h = w / aspect
    else w = h * aspect
  }
  const shrink = Math.min(1, imgW / w, imgH / h)
  w *= shrink
  h *= shrink

  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return {
    x: Math.min(imgW - w, Math.max(0, cx - w / 2)),
    y: Math.min(imgH - h, Math.max(0, cy - h / 2)),
    w,
    h,
  }
}

export default function CropTool({ photo, onSave }) {
  const { t } = useT()
  const wrapRef = useRef(null)
  const dragRef = useRef(null)
  const [box, setBox] = useState({ w: 640, h: 420 })
  const [aspect, setAspect] = useState(null)
  const [rect, setRect] = useState(null)
  const [status, setStatus] = useState('')
  const {
    heads,
    status: detection,
    error: detectionError,
    run: detectHeads,
    clear: clearHeads,
  } = useHeadDetection(photo)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [photo])

  // A different photo starts a fresh crop.
  useEffect(() => {
    setRect(photo ? centeredRect(photo.width, photo.height, aspect) : null)
    setStatus('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo])

  function changeAspect(next) {
    setAspect(next)
    if (photo) setRect(centeredRect(photo.width, photo.height, next))
  }

  if (!photo) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="max-w-xs text-center text-xs leading-relaxed text-neutral-500">
          {t('cropEmpty')}
        </p>
      </div>
    )
  }

  const scale = Math.max(
    0.02,
    Math.min(3, (box.w - 8) / photo.width, (box.h - 8) / photo.height),
  )
  const dispW = Math.round(photo.width * scale)
  const dispH = Math.round(photo.height * scale)
  const r = rect ?? centeredRect(photo.width, photo.height, aspect)

  function beginDrag(e, mode) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode, x: e.clientX, y: e.clientY, start: r }
  }

  function onMove(e) {
    const d = dragRef.current
    if (!d) return
    const dx = (e.clientX - d.x) / scale
    const dy = (e.clientY - d.y) / scale

    if (d.mode === 'move') {
      setRect({
        ...d.start,
        x: Math.min(photo.width - d.start.w, Math.max(0, d.start.x + dx)),
        y: Math.min(photo.height - d.start.h, Math.max(0, d.start.y + dy)),
      })
    } else {
      setRect(resizeRect(d.mode, d.start, dx, dy, aspect, photo.width, photo.height))
    }
  }

  function endDrag(e) {
    if (dragRef.current) e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragRef.current = null
  }

  function snapToHead(box, label) {
    setRect(rectFromBox(padBox(box, HEAD_PADDING, photo.width, photo.height), aspect, photo.width, photo.height))
    setStatus(label)
    clearHeads() // boxes have served their purpose; get them out of the way of dragging
  }

  function renderCrop() {
    const x = Math.round(r.x)
    const y = Math.round(r.y)
    const w = Math.max(1, Math.round(r.w))
    const h = Math.max(1, Math.round(r.h))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(photo.img, x, y, w, h, 0, 0, w, h)
    return { canvas, w, h }
  }

  async function saveAsPhoto() {
    const { canvas, w, h } = renderCrop()
    const blob = await canvasToBlob(canvas, 'image/png')
    if (!blob) return
    // The crop inherits the original's capture date, not today's.
    const added = await photoFromBlob(blob, `${baseName(photo.name)} (crop).png`, photo.date)
    onSave(added)
    setStatus(t('savedToLibrary', { w, h }))
  }

  async function downloadCrop() {
    const { canvas, w, h } = renderCrop()
    const blob = await canvasToBlob(canvas, 'image/png')
    if (blob) downloadBlob(blob, `${baseName(photo.name)}-crop-${w}x${h}.png`)
  }

  const outW = Math.max(1, Math.round(r.w))
  const outH = Math.max(1, Math.round(r.h))

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0 lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col p-4 lg:p-5">
        <div ref={wrapRef} className="flex min-h-[42vh] flex-1 items-center justify-center lg:min-h-0">
          <div className="checkerboard no-callout relative select-none shadow-2xl shadow-black/50" style={{ width: dispW, height: dispH }}>
            <img
              src={photo.url}
              alt={photo.name}
              draggable={false}
              style={{ width: dispW, height: dispH }}
              className="block"
            />
            {/* Dim everything outside the crop. */}
            <div
              className="pointer-events-none absolute inset-0 bg-black/55"
              style={{
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${r.x * scale}px ${r.y * scale}px, ${
                  r.x * scale
                }px ${(r.y + r.h) * scale}px, ${(r.x + r.w) * scale}px ${(r.y + r.h) * scale}px, ${
                  (r.x + r.w) * scale
                }px ${r.y * scale}px, ${r.x * scale}px ${r.y * scale}px)`,
              }}
            />

            <div
              onPointerDown={(e) => beginDrag(e, 'move')}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{
                left: r.x * scale,
                top: r.y * scale,
                width: r.w * scale,
                height: r.h * scale,
              }}
              // touch-action:none, or dragging the box just scrolls the page on touch.
              className="absolute cursor-move touch-none outline outline-2 outline-white/90"
            >
              {/* Rule-of-thirds guides */}
              <div className="pointer-events-none absolute inset-0 opacity-40">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white" />
              </div>

              {HANDLES.map((mode) => (
                <div
                  key={mode}
                  onPointerDown={(e) => beginDrag(e, mode)}
                  onPointerMove={onMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  style={{ ...HANDLE_POS[mode] }}
                  className="crop-handle absolute touch-none rounded-sm border border-neutral-700 bg-white"
                />
              ))}
            </div>

            {/* Detected heads sit above the crop box so they stay clickable where they overlap. */}
            {(heads ?? []).map((h, i) => (
              <button
                key={i}
                onClick={() => snapToHead(h, t('croppedToHead', { n: i + 1 }))}
                title={t('cropToHeadN', { n: i + 1 })}
                data-head-box
                style={{ left: h.x * scale, top: h.y * scale, width: h.w * scale, height: h.h * scale }}
                className="absolute rounded-sm outline outline-2 outline-emerald-400 transition hover:bg-emerald-400/25"
              >
                <span className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-emerald-950">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>

        <footer className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={saveAsPhoto}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
          >
            {t('saveCrop')}
          </button>
          <button
            onClick={downloadCrop}
            className="rounded-lg border border-neutral-800 px-4 py-2 text-xs font-medium text-neutral-300 transition hover:border-neutral-600"
          >
            {t('downloadPng')}
          </button>
          <span className="text-[11px] text-neutral-500">
            {status || t('cropInfo', { w: outW, h: outH, sw: photo.width, sh: photo.height })}
          </span>
        </footer>
      </section>

      <aside className="w-full shrink-0 space-y-6 border-t border-neutral-800 bg-neutral-950 p-4 lg:w-72 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">{t('photo')}</p>
          <p className="truncate text-xs text-neutral-300" title={photo.name}>
            {photo.name}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">{t('aspectRatio')}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {RATIOS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => changeAspect(opt.value)}
                className={`rounded-md border px-1 py-1.5 text-[11px] transition ${
                  aspect === opt.value
                    ? 'border-indigo-500 bg-indigo-600/15 text-indigo-200'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                }`}
              >
                {opt.value === null ? t('free') : opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{t('selection')}</p>
          <dl className="grid grid-cols-2 gap-1 text-[11px] text-neutral-400">
            <dt>{t('axisX')}</dt>
            <dd className="text-right text-neutral-200">{Math.round(r.x)} px</dd>
            <dt>{t('axisY')}</dt>
            <dd className="text-right text-neutral-200">{Math.round(r.y)} px</dd>
            <dt>{t('width')}</dt>
            <dd className="text-right text-neutral-200">{outW} px</dd>
            <dt>{t('height')}</dt>
            <dd className="text-right text-neutral-200">{outH} px</dd>
          </dl>
        </div>

        <div className="space-y-2 border-t border-neutral-800 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{t('headDetection')}</p>

          <button
            onClick={detectHeads}
            disabled={detection === 'loading'}
            className="w-full rounded-md border border-emerald-800 bg-emerald-600/10 px-2 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:border-emerald-600 disabled:opacity-40"
          >
            {detection === 'loading' ? t('scanning') : t('detectHeads')}
          </button>

          {detection === 'done' && heads.length > 1 && (
            <button
              onClick={() => snapToHead(unionBox(heads), t('croppedToAll', { n: heads.length }))}
              className="w-full rounded-md bg-indigo-600 px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-indigo-500"
            >
              {t('fitAllHeads', { n: heads.length })}
            </button>
          )}

          {heads?.length > 0 && (
            <button
              onClick={clearHeads}
              className="w-full rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-400 transition hover:border-neutral-600"
            >
              {t('hideBoxes')}
            </button>
          )}

          <p className="text-[10px] leading-snug text-neutral-600">
            {detection === 'loading' && t('detectLoadingHelp')}
            {detection === 'error' && <span className="text-red-400">{detectionError}</span>}
            {detection === 'done' && (heads.length === 0 ? t('detectNoneHelp') : t('detectDoneHelp'))}
            {detection === 'idle' && t('detectIdleHelp')}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setRect(centeredRect(photo.width, photo.height, aspect))}
            className="flex-1 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300 transition hover:border-neutral-600"
          >
            {t('reset')}
          </button>
          <button
            onClick={() => setRect(centeredRect(photo.width, photo.height, aspect, 1))}
            className="flex-1 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-300 transition hover:border-neutral-600"
          >
            {t('selectAll')}
          </button>
        </div>

        <p className="text-[10px] leading-snug text-neutral-600">
          {t('cropHelp')}
        </p>
      </aside>
    </div>
  )
}
