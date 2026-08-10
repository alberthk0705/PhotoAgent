import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../lib/i18n.jsx'
import { supported as storageSupported, usage } from '../lib/store.js'
import { matchesFilter, tagIndex } from '../lib/tags.js'

const MAX_CHIPS = 8

function formatBytes(bytes) {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? ` · ${mb.toFixed(1)} MB` : ` · ${Math.round(bytes / 1024)} KB`
}

export default function PhotoLibrary({
  photos,
  onImport,
  onDelete,
  onCrop,
  onPick,
  activeId,
  hint,
  restoring,
  storageNote,
  onClear,
  autoTag,
  onAutoTagChange,
  tagging,
  tagError,
}) {
  const { t } = useT()
  const inputRef = useRef(null)
  const [size, setSize] = useState(null)
  const [filter, setFilter] = useState('')

  // Re-estimate whenever the library changes; the number is indicative, and
  // browsers report it with deliberate imprecision.
  useEffect(() => {
    if (!storageSupported || !photos.length) {
      setSize(null)
      return
    }
    let cancelled = false
    usage().then((bytes) => !cancelled && setSize(bytes))
    return () => {
      cancelled = true
    }
  }, [photos.length])

  const chips = useMemo(() => tagIndex(photos).slice(0, MAX_CHIPS), [photos])
  const visible = useMemo(() => photos.filter((p) => matchesFilter(p, filter)), [photos, filter])
  const filtering = filter.trim().length > 0

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-neutral-800 bg-neutral-950 lg:h-full lg:w-64 lg:border-b-0 lg:border-r">
      <div className="border-b border-neutral-800 p-3">
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
        >
          {t('importPhotos')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onImport(e.target.files)
            e.target.value = '' // allow re-importing the same file
          }}
        />
        <p className="mt-2 text-[11px] leading-snug text-neutral-500">{hint}</p>
      </div>

      {photos.length > 0 && (
        <div className="space-y-2 border-b border-neutral-800 p-3">
          <input
            type="search"
            value={filter}
            aria-label="tag filter"
            placeholder={t('filterPlaceholder')}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500"
          />

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {chips.map((tag) => {
                const active = filter.trim().toLowerCase() === tag.label
                return (
                  <button
                    key={tag.label}
                    onClick={() => setFilter(active ? '' : tag.label)}
                    title={`${tag.label} · ${tag.count}`}
                    className={`rounded-full px-2 py-0.5 text-[10px] transition ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                    }`}
                  >
                    {tag.label}
                    <span className="ml-1 opacity-60">{tag.count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {filtering && (
            <p className="flex items-center gap-2 text-[10px] text-neutral-500">
              {t('showingCount', { shown: visible.length, total: photos.length })}
              <button onClick={() => setFilter('')} className="text-indigo-400 hover:text-indigo-300">
                {t('clearFilter')}
              </button>
            </p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-x-auto p-3 lg:overflow-x-hidden lg:overflow-y-auto">
        {restoring ? (
          <p className="mt-6 text-center text-[11px] text-neutral-600">{t('restoring')}</p>
        ) : photos.length === 0 ? (
          <p className="mt-6 text-center text-[11px] leading-relaxed text-neutral-600">
            {t('noPhotos')}
            <br />
            {t('noPhotosHint')}
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-6 text-center text-[11px] leading-relaxed text-neutral-600">{t('noMatches')}</p>
        ) : (
          <ul className="flex gap-2 lg:grid lg:grid-cols-2">
            {visible.map((p) => (
              <li key={p.id} className="group relative w-28 shrink-0 lg:w-auto">
                <button
                  onClick={() => onPick(p.id)}
                  title={[`${p.name} — ${p.width}×${p.height}`, (p.tags ?? []).map((tg) => tg.label).join(', ')]
                    .filter(Boolean)
                    .join('\n')}
                  className={`block w-full overflow-hidden rounded-lg border-2 transition ${
                    activeId === p.id ? 'border-indigo-500' : 'border-transparent hover:border-neutral-600'
                  }`}
                >
                  <img src={p.url} alt={p.name} className="checkerboard aspect-square w-full object-cover" />
                </button>

                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 rounded-b-lg bg-gradient-to-t from-black/85 to-transparent p-1 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                  <button
                    onClick={() => onCrop(p.id)}
                    className="rounded bg-neutral-800/90 px-1.5 py-0.5 text-[10px] text-neutral-200 hover:bg-neutral-700"
                  >
                    {t('crop')}
                  </button>
                  <button
                    onClick={() => onDelete(p.id)}
                    title={t('removeTitle')}
                    className="rounded bg-neutral-800/90 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-900/80"
                  >
                    {t('remove')}
                  </button>
                </div>

                <p className="mt-1 truncate text-[10px] text-neutral-500" title={p.name}>
                  {p.width}×{p.height}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-neutral-800 p-3 text-[10px] leading-snug">
        <label className="flex items-center gap-2 text-neutral-400">
          <input
            type="checkbox"
            checked={autoTag}
            aria-label="auto tag"
            onChange={(e) => onAutoTagChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-indigo-500"
          />
          {t('autoTag')}
        </label>

        {tagging > 0 && <p className="text-indigo-300">{t('tagging', { n: tagging })}</p>}
        {tagError && <p className="text-amber-500">{t('tagUnavailable')}</p>}

        {storageNote ? (
          <p className="text-amber-500">{t(storageNote)}</p>
        ) : (
          photos.length > 0 && <p className="text-neutral-600">{t('savedOnDevice', { size: formatBytes(size) })}</p>
        )}

        {photos.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm(t('clearConfirm', { n: photos.length }))) onClear()
            }}
            className="w-full rounded-md border border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-400 transition hover:border-red-800 hover:text-red-300"
          >
            {t('clearLibrary')}
          </button>
        )}
      </div>
    </aside>
  )
}
