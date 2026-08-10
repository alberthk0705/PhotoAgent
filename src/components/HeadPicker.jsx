import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.jsx'
import { useHeadDetection } from '../lib/useHeadDetection.js'
import { unionBox } from '../lib/faces.js'

/**
 * Modal that detects heads in `photo` and lets the user click one.
 * Used by the merge view, where the cell only shows part of the photo — so the
 * choice has to be made against the full image, not the cropped preview.
 */
export default function HeadPicker({ photo, onChoose, onClose }) {
  const { t } = useT()
  const { heads, status, error, run } = useHeadDetection(photo)
  const wrapRef = useRef(null)
  const [box, setBox] = useState({ w: 640, h: 420 })

  useEffect(() => {
    run()
  }, [run])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  // Scale small photos up, or their head boxes end up too small to click.
  const scale = Math.max(0.02, Math.min(3, (box.w - 8) / photo.width, (box.h - 8) / photo.height))
  const dispW = Math.round(photo.width * scale)
  const dispH = Math.round(photo.height * scale)
  const all = heads && heads.length > 1 ? unionBox(heads) : null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col rounded-xl border border-neutral-800 bg-neutral-950 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-xs font-semibold text-neutral-100">{t('chooseHead')}</h2>
          <span className="text-[11px] text-neutral-500">
            {status === 'loading' && t('pickerLoading')}
            {status === 'error' && <span className="text-red-400">{error}</span>}
            {status === 'done' && (heads.length ? t('foundN', { n: heads.length }) : t('noneFound'))}
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded-md border border-neutral-800 px-2 py-1 text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
          >
            {t('close')}
          </button>
        </div>

        <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center">
          <div className="checkerboard relative" style={{ width: dispW, height: dispH }}>
            <img
              src={photo.url}
              alt={photo.name}
              draggable={false}
              style={{ width: dispW, height: dispH }}
              className="block select-none"
            />

            {status === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="rounded bg-neutral-900 px-3 py-1.5 text-[11px] text-neutral-300">{t('scanning')}</span>
              </div>
            )}

            {(heads ?? []).map((h, i) => (
              <button
                key={i}
                onClick={() => onChoose(h)}
                title={t('frameHeadN', { n: i + 1 })}
                data-head-box
                style={{ left: h.x * scale, top: h.y * scale, width: h.w * scale, height: h.h * scale }}
                className="absolute rounded-sm outline outline-2 outline-emerald-400 transition hover:bg-emerald-400/25 focus:bg-emerald-400/25"
              >
                <span className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-emerald-950">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {all && (
            <button
              onClick={() => onChoose(all, heads)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-500"
            >
              {t('fitAllHeads', { n: heads.length })}
            </button>
          )}
          {status === 'error' && (
            <button
              onClick={run}
              className="rounded-lg border border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-300 hover:border-neutral-600"
            >
              {t('tryAgain')}
            </button>
          )}
          <p className="text-[10px] leading-snug text-neutral-600">
            {t('pickerHelp')}
          </p>
        </div>
      </div>
    </div>
  )
}
