import { useCallback, useEffect, useState } from 'react'
import PhotoLibrary from './components/PhotoLibrary.jsx'
import MergeView from './components/MergeView.jsx'
import CropTool from './components/CropTool.jsx'
import { LAYOUTS, cellCount, makeCell } from './lib/compose.js'
import { photosFromFiles, photosFromRecords, releasePhoto, reserveSeq } from './lib/images.js'
import {
  allPhotoRecords,
  clearMeta,
  clearPhotos,
  deletePhotoRecord,
  getMeta,
  isQuotaError,
  putMeta,
  putPhoto,
  supported as storageSupported,
} from './lib/store.js'
import { formatStampDate } from './lib/exif.js'
import { LANGUAGES, useT } from './lib/i18n.jsx'

export default function App() {
  const { t, lang, setLang } = useT()

  const [photos, setPhotos] = useState([])
  const [tab, setTab] = useState('merge')
  const [cropId, setCropId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [restoring, setRestoring] = useState(storageSupported)
  const [storageNote, setStorageNote] = useState(storageSupported ? '' : 'storageOff')

  // Composite settings — kept here so switching tabs never loses the layout.
  const [layout, setLayout] = useState('1x2')
  const [cells, setCells] = useState(() => Array.from({ length: 2 }, makeCell))
  const [selected, setSelected] = useState(0)
  const [output, setOutput] = useState({ width: 1920, height: 1080 })
  const [gap, setGap] = useState(16)
  const [padding, setPadding] = useState(16)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [date, setDate] = useState({
    enabled: true,
    text: '',
    color: '#ff9d2e',
    corner: 'br',
    margin: 32,
    size: 4,
  })

  const persistPhotos = useCallback(async (added) => {
    if (!storageSupported) return
    try {
      for (const photo of added) await putPhoto(photo)
    } catch (err) {
      // Losing persistence is not worth losing the photo that is already in
      // memory — carry on and say so.
      setStorageNote(isQuotaError(err) ? 'storageFull' : 'storageOff')
    }
  }, [])

  // Restore whatever the last session left behind.
  useEffect(() => {
    if (!storageSupported) return
    let cancelled = false

    ;(async () => {
      try {
        const [records, saved] = await Promise.all([allPhotoRecords(), getMeta('composite')])
        if (cancelled) return

        const restored = await photosFromRecords(records)
        if (cancelled) return
        if (restored.length) reserveSeq(Math.max(...restored.map((p) => p.seq)))
        setPhotos(restored)

        if (saved) {
          const live = new Set(restored.map((p) => p.id))
          const layoutKey = LAYOUTS[saved.layout] ? saved.layout : '1x2'
          const savedCells = saved.cells ?? []
          setLayout(layoutKey)
          // Rebuild to the layout's own cell count, and drop any id whose photo
          // failed to restore — a dangling id would render a "filled" cell that
          // never shows anything.
          setCells(
            Array.from({ length: cellCount(layoutKey) }, (_, i) => {
              const c = savedCells[i] ?? {}
              return { ...makeCell(), ...c, photoId: live.has(c.photoId) ? c.photoId : null }
            }),
          )
          setSelected(0)
          if (saved.output) setOutput(saved.output)
          if (typeof saved.gap === 'number') setGap(saved.gap)
          if (typeof saved.padding === 'number') setPadding(saved.padding)
          if (saved.bgColor) setBgColor(saved.bgColor)
          if (saved.date) setDate((prev) => ({ ...prev, ...saved.date }))
        }
      } catch {
        if (!cancelled) setStorageNote('storageOff')
      } finally {
        if (!cancelled) setRestoring(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const changeLayout = useCallback((next) => {
    const n = cellCount(next)
    setLayout(next)
    setCells((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? makeCell()))
    setSelected((s) => Math.min(s, n - 1))
  }, [])

  const updateCell = useCallback((index, patch) => {
    setCells((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }, [])

  const updateDate = useCallback((patch) => setDate((prev) => ({ ...prev, ...patch })), [])

  const addPhotos = useCallback((added) => {
    if (!added.length) return
    setPhotos((prev) => [...prev, ...added])

    // Drop new photos into whatever cells are still empty, in order.
    setCells((prev) => {
      const queue = [...added]
      return prev.map((c) => (c.photoId || !queue.length ? c : { ...c, photoId: queue.shift().id }))
    })

    // Seed the stamp from the first photo that arrives; never overwrite a value
    // the user has already set.
    setDate((prev) => (prev.text ? prev : { ...prev, text: formatStampDate(added[0].date) }))

    persistPhotos(added)
  }, [persistPhotos])

  const importFiles = useCallback(
    async (fileList) => {
      addPhotos(await photosFromFiles(fileList))
    },
    [addPhotos],
  )

  const deletePhoto = useCallback((id) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) releasePhoto(target)
      return prev.filter((p) => p.id !== id)
    })
    setCells((prev) => prev.map((c) => (c.photoId === id ? { ...c, photoId: null } : c)))
    setCropId((c) => (c === id ? null : c))
    if (storageSupported) deletePhotoRecord(id).catch(() => {})
  }, [])

  const clearLibrary = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach(releasePhoto)
      return []
    })
    setCells((prev) => prev.map((c) => ({ ...c, photoId: null })))
    setCropId(null)
    setDate((prev) => ({ ...prev, text: '' }))
    if (storageSupported) Promise.all([clearPhotos(), clearMeta()]).catch(() => {})
  }, [])

  const assignToSelectedCell = useCallback(
    (photoId) => {
      const next = cells.map((c, i) => (i === selected ? { ...c, photoId } : c))
      setCells(next)
      // Advance to the next still-empty cell so repeated clicks fill the grid.
      const empty = next.findIndex((c, i) => i > selected && !c.photoId)
      if (empty !== -1) setSelected(empty)
    },
    [cells, selected],
  )

  const openInCrop = useCallback((id) => {
    setCropId(id)
    setTab('crop')
  }, [])

  // Save the composite settings shortly after they settle, so dragging a
  // slider doesn't mean a write per frame.
  useEffect(() => {
    if (!storageSupported || restoring) return
    const id = setTimeout(() => {
      putMeta('composite', { layout, cells, output, gap, padding, bgColor, date }).catch(() => {})
    }, 400)
    return () => clearTimeout(id)
  }, [restoring, layout, cells, output, gap, padding, bgColor, date])

  // Drag a file anywhere onto the window to import it.
  useEffect(() => {
    const onOver = (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      e.preventDefault()
      setDragging(true)
    }
    const onLeave = (e) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const onDrop = (e) => {
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault()
      setDragging(false)
      importFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [importFiles])

  const cropTarget = photos.find((p) => p.id === cropId) ?? null

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-800 px-5 py-3">
        <h1 className="text-sm font-semibold tracking-wide text-neutral-100">
          Photo<span className="text-indigo-400">Agent</span>
        </h1>
        <nav className="flex gap-1 rounded-lg bg-neutral-900 p-1">
          {[
            ['merge', t('tabMerge')],
            ['crop', t('tabCrop')],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                tab === key ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <span className="ml-auto hidden text-xs text-neutral-500 lg:inline">{t('tagline')}</span>

        <div className="flex gap-1 rounded-lg bg-neutral-900 p-1" title={t('language')}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              lang={l.code === 'zh' ? 'zh-Hant' : 'en'}
              title={l.name}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                lang === l.code ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      {/* Stacked on tablets and phones; side-by-side once there's room. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PhotoLibrary
          photos={photos}
          onImport={importFiles}
          onDelete={deletePhoto}
          onCrop={openInCrop}
          onPick={tab === 'merge' ? assignToSelectedCell : setCropId}
          activeId={tab === 'crop' ? cropId : cells[selected]?.photoId}
          hint={tab === 'merge' ? t('hintPlaceInCell', { n: selected + 1 }) : t('hintClickToCrop')}
          restoring={restoring}
          storageNote={storageNote}
          onClear={clearLibrary}
        />

        <main className="min-w-0 flex-1 overflow-auto">
          {tab === 'merge' ? (
            <MergeView
              photos={photos}
              layout={layout}
              onLayoutChange={changeLayout}
              cells={cells}
              onCellChange={updateCell}
              selected={selected}
              onSelect={setSelected}
              output={output}
              onOutputChange={setOutput}
              gap={gap}
              onGapChange={setGap}
              padding={padding}
              onPaddingChange={setPadding}
              bgColor={bgColor}
              onBgColorChange={setBgColor}
              date={date}
              onDateChange={updateDate}
            />
          ) : (
            <CropTool photo={cropTarget} onSave={(p) => addPhotos([p])} />
          )}
        </main>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/60 backdrop-blur-sm">
          <p className="rounded-xl border-2 border-dashed border-indigo-400 px-8 py-6 text-sm font-medium text-indigo-100">
            {t('dropToImport')}
          </p>
        </div>
      )}
    </div>
  )
}
