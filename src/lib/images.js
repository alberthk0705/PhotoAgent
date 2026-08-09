let counter = 0
const nextId = () => `p${++counter}`

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = url
  })
}

/** Turn a File (or Blob) into a photo record the rest of the app understands. */
export async function photoFromBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const img = await loadImage(url)
  return {
    id: nextId(),
    name,
    url,
    img,
    width: img.naturalWidth,
    height: img.naturalHeight,
  }
}

export async function photosFromFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
  const settled = await Promise.allSettled(files.map((f) => photoFromBlob(f, f.name)))
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
