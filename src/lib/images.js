import { readCaptureDate } from './exif.js'

// Sequence numbers double as ids and as the restore order after a reload.
let counter = 0
const nextSeq = () => ++counter

/** After restoring, resume numbering past whatever was already stored. */
export function reserveSeq(seq) {
  counter = Math.max(counter, seq)
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = url
  })
}

/**
 * Turn a File (or Blob) into a photo record the rest of the app understands.
 * The original blob is kept on the record so the photo can be persisted and
 * restored without ever re-encoding it.
 */
export async function photoFromBlob(blob, name, date = null, seq = null) {
  const s = seq ?? nextSeq()
  const url = URL.createObjectURL(blob)
  const img = await loadImage(url)
  return {
    id: `p${s}`,
    seq: s,
    name,
    url,
    img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    date,
    blob,
  }
}

/** Rebuild a photo from its stored record. */
export function photoFromRecord(record) {
  return photoFromBlob(record.blob, record.name, record.date ?? null, record.seq)
}

/** Restore many records, skipping any that fail to decode. */
export async function photosFromRecords(records) {
  const settled = await Promise.allSettled(records.map(photoFromRecord))
  return settled.filter((r) => r.status === 'fulfilled').map((r) => r.value)
}

async function photoFromFile(file) {
  // EXIF capture date when the camera recorded one, otherwise the file's own
  // timestamp — which is the best a screenshot or a stripped image can offer.
  const captured = await readCaptureDate(file)
  const date = captured ?? (file.lastModified ? new Date(file.lastModified) : null)
  return photoFromBlob(file, file.name, date)
}

export async function photosFromFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
  const settled = await Promise.allSettled(files.map(photoFromFile))
  return settled.filter((r) => r.status === 'fulfilled').map((r) => r.value)
}

export function releasePhoto(photo) {
  URL.revokeObjectURL(photo.url)
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before dropping the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Strip the extension so we can append a suffix like " (crop)". */
export function baseName(name) {
  return name.replace(/\.[^./\\]+$/, '')
}
