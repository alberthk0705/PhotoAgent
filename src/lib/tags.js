// Image tagging, powered by MediaPipe's EfficientNet-Lite0 classifier
// (1000 ImageNet labels, int8, ~5 MB).
//
// It shares the WASM runtime already shipped for head detection, so the only
// extra download is the model itself — and only for people who import a photo
// with auto-tagging on. Classification runs on-device; no image leaves it.

import { downscaleForModel } from './images.js'

const BASE = import.meta.env.BASE_URL

// The network's own input is 224px square; anything larger is just resizing work.
const MAX_INPUT = 512

const MAX_TAGS = 5

// ImageNet scores are a softmax over 1000 classes, so even a confident label
// rarely dominates. Low enough to be useful, high enough to keep out noise.
const MIN_SCORE = 0.06

let classifierPromise = null

function loadClassifier() {
  if (classifierPromise) return classifierPromise

  classifierPromise = (async () => {
    const { FilesetResolver, ImageClassifier } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`)
    return ImageClassifier.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${BASE}models/efficientnet_lite0.tflite` },
      runningMode: 'IMAGE',
      maxResults: MAX_TAGS,
      scoreThreshold: MIN_SCORE,
    })
  })().catch((err) => {
    classifierPromise = null // a later attempt may succeed; don't cache the failure
    throw err
  })

  return classifierPromise
}

/**
 * ImageNet names carry synonym lists ("tabby, tabby cat") and odd casing
 * ("Egyptian cat"). Keep the first synonym, lowercased — that reads as a tag.
 */
export function cleanLabel(raw) {
  return String(raw ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase()
}

/** Tags for a photo, best first. Resolves to [] when nothing clears the threshold. */
export async function classifyPhoto(photo) {
  const classifier = await loadClassifier()
  const { source } = downscaleForModel(photo.img, MAX_INPUT)
  const result = classifier.classify(source)
  const categories = result?.classifications?.[0]?.categories ?? []

  const seen = new Set()
  const tags = []
  for (const c of categories) {
    const label = cleanLabel(c.categoryName || c.displayName)
    // Different ImageNet classes can share a first synonym; keep the best one.
    if (!label || seen.has(label)) continue
    seen.add(label)
    tags.push({ label, score: Number(c.score?.toFixed(3)) || 0 })
  }
  return tags
}

/** Every distinct tag in the library, most common first. */
export function tagIndex(photos) {
  const counts = new Map()
  for (const photo of photos) {
    for (const tag of photo.tags ?? []) {
      counts.set(tag.label, (counts.get(tag.label) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }))
}

export function matchesFilter(photo, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (photo.tags ?? []).some((t) => t.label.includes(q))
}
