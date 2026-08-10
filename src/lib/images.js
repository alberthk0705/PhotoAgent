import { readCaptureDate } from './exif.js'

// Sequence numbers double as ids and as the restore order after a reload.
let counter = 0
const nextSeq = () => ++counter

/** After restoring, resume numbering past whatever was already stored. */
export function reserveSeq(seq) {
  counter = Math.max(counter, seq)
}

/**
 * A downscaled copy for model input. These models are trained on small images;
 * feeding them a 6000 px photo costs time and buys no accuracy.
 */
export function downscaleForModel(img, maxSize) {
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = Math.min(1, maxSize / longest)
  if (scale === 1) return { source: img, scale: 1 }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { source: canvas, scale }
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
    tags: null, // null = not classified yet, [] = classified and found nothing
  }
}

/** Rebuild a photo from its stored record. */
export async function photoFromRecord(record) {
  const photo = await photoFromBlob(record.blob, record.name, record.date ?? null, record.seq)
  return { ...photo, tags: record.tags ?? null }
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
