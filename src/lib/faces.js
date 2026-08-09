// Head detection, powered by MediaPipe's BlazeFace short-range model.
//
// The WASM runtime and the model are served from this site (see public/), never a CDN,
// and detection runs entirely in the browser — no image data leaves the machine.
// Everything here is loaded on first use so the ~3.5 MB runtime costs nothing to
// visitors who never press "Detect heads".

const BASE = import.meta.env.BASE_URL

// BlazeFace short-range is trained on small inputs; feeding it a 6000 px photo is
// slow and no more accurate. Detect on a downscaled copy, then map boxes back.
const MAX_DETECT_SIZE = 1024

// BlazeFace returns a *face* box (roughly brow to chin). A head needs hair, ears and
// some jaw, so grow it — more above than below, since hair is what gets clipped.
const HEAD_WIDTH_SCALE = 1.5
const HEAD_HEIGHT_SCALE = 1.85
const HEAD_TOP_BIAS = 0.56 // share of the grown height placed above the face centre

let detectorPromise = null

function loadDetector() {
  if (detectorPromise) return detectorPromise

  detectorPromise = (async () => {
    const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`)
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${BASE}models/blaze_face_short_range.tflite` },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.4,
    })
  })().catch((err) => {
    detectorPromise = null // let the next attempt retry rather than caching the failure
    throw err
  })

  return detectorPromise
}

function downscale(img) {
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = Math.min(1, MAX_DETECT_SIZE / longest)
  if (scale === 1) return { source: img, scale: 1 }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { source: canvas, scale }
}

function clampBox(box, imgW, imgH) {
  const x = Math.max(0, Math.min(box.x, imgW))
  const y = Math.max(0, Math.min(box.y, imgH))
  return { x, y, w: Math.min(box.w, imgW - x), h: Math.min(box.h, imgH - y) }
}

function faceToHead(detection, scale, imgW, imgH) {
  const b = detection.boundingBox
  const fx = b.originX / scale
  const fy = b.originY / scale
  const fw = b.width / scale
  const fh = b.height / scale

  const cx = fx + fw / 2
  const cy = fy + fh / 2
  const w = fw * HEAD_WIDTH_SCALE
  const h = fh * HEAD_HEIGHT_SCALE

  const head = clampBox({ x: cx - w / 2, y: cy - h * HEAD_TOP_BIAS, w, h }, imgW, imgH)
  return {
    ...head,
    score: detection.categories?.[0]?.score ?? 0,
    face: clampBox({ x: fx, y: fy, w: fw, h: fh }, imgW, imgH),
  }
}

/**
 * Detect heads in a photo record. Returns boxes in the photo's own pixel
 * coordinates, largest first. Resolves to [] when nobody is found.
 */
export async function detectHeads(photo) {
  const detector = await loadDetector()
  const { source, scale } = downscale(photo.img)
  const result = detector.detect(source)
  return (result.detections ?? [])
    .map((d) => faceToHead(d, scale, photo.width, photo.height))
    .sort((a, b) => b.w * b.h - a.w * a.h)
}

/** Smallest box containing every box given. */
export function unionBox(boxes) {
  if (!boxes.length) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  return { x, y, w: right - x, h: bottom - y }
}

/** Grow a box by a fraction of its size, staying inside the image. */
export function padBox(box, fraction, imgW, imgH) {
  const dw = box.w * fraction
  const dh = box.h * fraction
  return clampBox({ x: box.x - dw / 2, y: box.y - dh / 2, w: box.w + dw, h: box.h + dh }, imgW, imgH)
}

/**
 * Focal point (0..1) that centres `box` in a cover cell whose visible source
 * region is sw × sh. Clamped, so a subject near an edge lands as close to
 * centre as the crop allows.
 */
export function focalPointFor(box, imgW, imgH, sw, sh) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const rangeX = imgW - sw
  const rangeY = imgH - sh
  return {
    fx: rangeX > 0 ? Math.min(1, Math.max(0, (cx - sw / 2) / rangeX)) : 0.5,
    fy: rangeY > 0 ? Math.min(1, Math.max(0, (cy - sh / 2) / rangeY)) : 0.5,
  }
}
