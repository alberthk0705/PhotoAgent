// Local persistence, so a reload doesn't throw away an in-progress collage.
//
// Photos are stored as their original Blobs — re-encoding them would lose
// quality and EXIF for no benefit. Nothing here talks to a network; IndexedDB
// is per-origin storage on the user's own device.

const DB_NAME = 'photoagent'
const VERSION = 1
const PHOTOS = 'photos'
const META = 'meta'

export const supported = typeof indexedDB !== 'undefined'

let dbPromise = null

function openDb() {
  if (!supported) return Promise.reject(new Error('IndexedDB unavailable'))
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'))
  }).catch((err) => {
    dbPromise = null // don't cache a failure; a later attempt may succeed
    throw err
  })

  return dbPromise
}

/**
 * Run `fn` inside a transaction and resolve once it commits — not merely once
 * the request fires, so a write is durable by the time the promise settles.
 */
function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        let out
        try {
          out = fn(t.objectStore(store))
        } catch (err) {
          reject(err)
          return
        }
        t.oncomplete = () => resolve(out && 'result' in out ? out.result : out)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error ?? new Error('Transaction aborted'))
      }),
  )
}

/** Strip the runtime-only fields; Blob and Date both survive structured clone. */
export function toRecord(photo) {
  return { id: photo.id, seq: photo.seq, name: photo.name, date: photo.date, blob: photo.blob }
}

export function putPhoto(photo) {
  return tx(PHOTOS, 'readwrite', (s) => s.put(toRecord(photo)))
}

export function deletePhotoRecord(id) {
  return tx(PHOTOS, 'readwrite', (s) => s.delete(id))
}

export function clearPhotos() {
  return tx(PHOTOS, 'readwrite', (s) => s.clear())
}

export async function allPhotoRecords() {
  const records = await tx(PHOTOS, 'readonly', (s) => s.getAll())
  // Insertion order, so a restored library reads the same as it was built.
  return (records ?? []).filter((r) => r?.blob).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export function putMeta(key, value) {
  return tx(META, 'readwrite', (s) => s.put(value, key))
}

export function getMeta(key) {
  return tx(META, 'readonly', (s) => s.get(key))
}

export function clearMeta() {
  return tx(META, 'readwrite', (s) => s.clear())
}

/** Rough size of what we're keeping, for the library footer. */
export async function usage() {
  try {
    const { usage: bytes } = (await navigator.storage?.estimate?.()) ?? {}
    return typeof bytes === 'number' ? bytes : null
  } catch {
    return null
  }
}

export function isQuotaError(err) {
  return err?.name === 'QuotaExceededError' || err?.code === 22
}
