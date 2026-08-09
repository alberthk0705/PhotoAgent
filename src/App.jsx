import { useCallback, useEffect, useState } from 'react'
import PhotoLibrary from './components/PhotoLibrary.jsx'
import MergeView from './components/MergeView.jsx'
import CropTool from './components/CropTool.jsx'
import { cellCount, makeCell } from './lib/compose.js'
import { photosFromFiles, releasePhoto } from './lib/images.js'

export default function App() {
  const [photos, setPhotos] = useState([])
  const [tab, setTab] = useState('merge')
  const [cropId, setCropId] = useState(null)
  const [dragging, setDragging] = useState(false)

  // Composite settings — kept here so switching tabs never loses the layout.
  const [layout, setLayout] = useState('1x2')
  const [cells, setCells] = useState(() => Array.from({ length: 2 }, makeCell))
  const [selected, setSelected] = useState(0)
  const [output, setOutput] = useState({ width: 1920, height: 1080 })
  const [gap, setGap] = useState(16)
  const [padding, setPadding] = useState(16)
  const [bgColor, setBgColor] = useState('#ffffff')

  const changeLayout = useCallback((next) => {
    const n = cellCount(next)
    setLayout(next)
    setCells((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? makeCell()))
    setSelected((s) => Math.min(s, n - 1))
  }, [])

  const updateCell = useCallback((index, patch) => {
    setCells((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }, [])

  const addPhotos = useCallback((added) => {
    if (!added.length) return
    setPhotos((prev) => [...prev, ...added])
    // Drop new photos into whatever cells are still empty, in order.
    setCells((prev) => {
      const queue = [...added]
      return prev.map((c) => (c.photoId || !queue.length ? c : { ...c, photoId: queue.shift().id }))
    })
  }, [])

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
            ['merge', 'Merge'],
            ['crop', 'Crop'],
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
        <span className="ml-auto text-xs text-neutral-500">
          Everything runs in your browser — no photo ever leaves this machine.
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <PhotoLibrary
          photos={photos}
          onImport={importFiles}
          onDelete={deletePhoto}
          onCrop={openInCrop}
          onPick={tab === 'merge' ? assignToSelectedCell : setCropId}
          activeId={tab === 'crop' ? cropId : cells[selected]?.photoId}
          hint={tab === 'merge' ? `Click a photo to place it in cell ${selected + 1}` : 'Click a photo to crop it'}
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
            />
          ) : (
            <CropTool photo={cropTarget} onSave={(p) => addPhotos([p])} />
          )}
        </main>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/60 backdrop-blur-sm">
          <p className="rounded-xl border-2 border-dashed border-indigo-400 px-8 py-6 text-sm font-medium text-indigo-100">
            Drop images to import
          </p>
        </div>
      )}
    </div>
  )
}
