import { useRef } from 'react'
import { useT } from '../lib/i18n.jsx'

export default function PhotoLibrary({ photos, onImport, onDelete, onCrop, onPick, activeId, hint }) {
  const { t } = useT()
  const inputRef = useRef(null)

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

      <div className="min-h-0 flex-1 overflow-x-auto p-3 lg:overflow-x-hidden lg:overflow-y-auto">
        {photos.length === 0 ? (
          <p className="mt-6 text-center text-[11px] leading-relaxed text-neutral-600">
            {t('noPhotos')}
            <br />
            {t('noPhotosHint')}
          </p>
        ) : (
          <ul className="flex gap-2 lg:grid lg:grid-cols-2">
            {photos.map((p) => (
              <li key={p.id} className="group relative w-28 shrink-0 lg:w-auto">
                <button
                  onClick={() => onPick(p.id)}
                  title={`${p.name} — ${p.width}×${p.height}`}
                  className={`block w-full overflow-hidden rounded-lg border-2 transition ${
                    activeId === p.id
                      ? 'border-indigo-500'
                      : 'border-transparent hover:border-neutral-600'
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
    </aside>
  )
}
