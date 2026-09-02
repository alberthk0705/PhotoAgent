// Layout definitions. Notation is rows × cols, matching the on-screen glyphs.
export const LAYOUTS = {
  '1x2': { rows: 1, cols: 2, label: '1 × 2' },
  '2x1': { rows: 2, cols: 1, label: '2 × 1' },
  '2x2': { rows: 2, cols: 2, label: '2 × 2' },
  '2x4': { rows: 2, cols: 4, label: '2 × 4' },
  '4x2': { rows: 4, cols: 2, label: '4 × 2' },
  '3x3': { rows: 3, cols: 3, label: '3 × 3' },
  '4x4': { rows: 4, cols: 4, label: '4 × 4' },
}

export const DATE_CORNERS = ['tl', 'tr', 'bl', 'br']

export function cellCount(layout) {
  const l = LAYOUTS[layout]
  return l.rows * l.cols
}

// Zoom multiplies the fit baseline. Cover cannot go below 1 without opening
// gaps, which is what Contain is for.
export const MAX_ZOOM = 8
export const MIN_ZOOM_CONTAIN = 0.2

export function minZoom(cell) {
  return cell?.fit === 'contain' ? MIN_ZOOM_CONTAIN : 1
}

export function clampZoom(cell, zoom) {
  return Math.min(MAX_ZOOM, Math.max(minZoom(cell), zoom))
}

export function makeCell() {
  return { photoId: null, fit: 'cover', fx: 0.5, fy: 0.5, zoom: 1 }
}

/**
 * Geometry of every cell, in output-image pixels.
 * Returns [] when the gaps/padding leave no room for content.
 */
export function cellRects({ layout, width, height, gap, padding }) {
  const { rows, cols } = LAYOUTS[layout]
  const w = (width - padding * 2 - gap * (cols - 1)) / cols
  const h = (height - padding * 2 - gap * (rows - 1)) / rows
  if (w <= 0 || h <= 0) return []

  const rects = []
  for (let i = 0; i < rows * cols; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    rects.push({ x: padding + c * (w + gap), y: padding + r * (h + gap), w, h })
  }
  return rects
}

const clamp01 = (n) => Math.min(1, Math.max(0, n))

/**
 * How `img` sits in a w×h cell: one scale, and how far it can pan on each axis.
 *
 * Cover and Contain differ only in the baseline scale — cover fills the cell,
 * contain fits inside it — so zoom, panning and drawing are one shared path.
 */
export function cellGeometry(img, w, h, cell) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const base = cell?.fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih)
  const scale = base * (cell?.zoom ?? 1)
  const dw = iw * scale
  const dh = ih * scale
  // Nothing to pan on an axis the photo no longer overflows.
  return { scale, dw, dh, panX: Math.max(0, dw - w), panY: Math.max(0, dh - h) }
}

/** Top-left of the drawn photo, in output pixels. Centred when it can't pan. */
export function cellOrigin(rect, geom, cell) {
  return {
    x: geom.panX > 0 ? rect.x - geom.panX * clamp01(cell?.fx ?? 0.5) : rect.x + (rect.w - geom.dw) / 2,
    y: geom.panY > 0 ? rect.y - geom.panY * clamp01(cell?.fy ?? 0.5) : rect.y + (rect.h - geom.dh) / 2,
  }
}

/**
 * Zoom to `nextZoom` while holding the image point under (px, py) still, so
 * the photo grows around the cursor or the pinch centre rather than drifting.
 */
export function zoomCellAt(img, rect, cell, nextZoom, px, py) {
  const zoom = clampZoom(cell, nextZoom)
  const before = cellGeometry(img, rect.w, rect.h, cell)
  const origin = cellOrigin(rect, before, cell)

  // The image coordinate currently sitting under the anchor.
  const ix = (px - origin.x) / before.scale
  const iy = (py - origin.y) / before.scale

  const after = cellGeometry(img, rect.w, rect.h, { ...cell, zoom })
  const wantX = px - ix * after.scale
  const wantY = py - iy * after.scale

  return {
    zoom,
    fx: after.panX > 0 ? clamp01((rect.x - wantX) / after.panX) : 0.5,
    fy: after.panY > 0 ? clamp01((rect.y - wantY) / after.panY) : 0.5,
  }
}

/** Focal point that centres an image-space box (a detected head) in the cell. */
export function focalPointForBox(box, rect, geom) {
  const cx = (box.x + box.w / 2) * geom.scale
  const cy = (box.y + box.h / 2) * geom.scale
  return {
    fx: geom.panX > 0 ? clamp01((cx - rect.w / 2) / geom.panX) : 0.5,
    fy: geom.panY > 0 ? clamp01((cy - rect.h / 2) / geom.panY) : 0.5,
  }
}

function drawInCell(ctx, img, rect, cell, bgColor) {
  const { x, y, w, h } = rect
  const geom = cellGeometry(img, w, h, cell)
  const origin = cellOrigin(rect, geom, cell)

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  // Zooming out past the cell leaves bare corners; paint them like the border.
  ctx.fillStyle = bgColor
  ctx.fillRect(x, y, w, h)

  // Draw only the slice of the source that lands inside the cell. At 8x on a
  // large photo, scaling the whole image and relying on the clip would ask the
  // rasteriser for an enormous surface for no visible gain.
  let sx = (x - origin.x) / geom.scale
  let sy = (y - origin.y) / geom.scale
  let sw = w / geom.scale
  let sh = h / geom.scale
  let dx = x
  let dy = y
  let dw = w
  let dh = h

  if (sx < 0) {
    const cut = -sx
    sx = 0
    sw -= cut
    dx += cut * geom.scale
    dw -= cut * geom.scale
  }
  if (sy < 0) {
    const cut = -sy
    sy = 0
    sh -= cut
    dy += cut * geom.scale
    dh -= cut * geom.scale
  }
  if (sx + sw > img.naturalWidth) {
    const cut = sx + sw - img.naturalWidth
    sw -= cut
    dw -= cut * geom.scale
  }
  if (sy + sh > img.naturalHeight) {
    const cut = sy + sh - img.naturalHeight
    sh -= cut
    dh -= cut * geom.scale
  }

  if (sw > 0 && sh > 0 && dw > 0 && dh > 0) ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
  ctx.restore()
}

const DATE_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Stamp size is relative to the output's short side, so it survives any export size. */
export function dateFontSize(W, H, size) {
  return Math.max(6, Math.round((Math.min(W, H) * size) / 100))
}

const dateFontCss = (fontSize) => `600 ${fontSize}px ${DATE_FONT_STACK}`

/**
 * Where the stamp is pinned, and which of its edges the pin holds.
 *
 * `x`/`y` are fractions of the output, set by dragging the stamp. While they
 * are unset the stamp falls back to its corner at `margin`, which is what the
 * corner buttons restore. The corner keeps deciding the alignment either way,
 * so a dragged stamp still grows away from the edge it was anchored to.
 */
export function dateAnchor(date, W, H, scale = 1) {
  const right = date.corner === 'tr' || date.corner === 'br'
  const bottom = date.corner === 'bl' || date.corner === 'br'
  const margin = (date.margin ?? 0) * scale
  return {
    x: Number.isFinite(date.x) ? date.x * W : right ? W - margin : margin,
    y: Number.isFinite(date.y) ? date.y * H : bottom ? H - margin : margin,
    align: right ? 'right' : 'left',
    baseline: bottom ? 'bottom' : 'top',
  }
}

/**
 * What the stamp actually reads. The extra text rides on the same line as the
 * date and shares its size, so the two stay one caption; either half alone is
 * a valid stamp.
 */
export function dateStampText(date) {
  return [date?.text, date?.suffix].map((part) => (part ?? '').trim()).filter(Boolean).join(' ')
}

let measurer = null

/**
 * The box the stamp occupies, in the same pixel space as W/H — the grab target
 * on the preview, and what a drag is clamped against. The height is one em plus
 * a little: the text is digits and dots in a single monospace weight, so there
 * is nothing to gain from measuring glyph outlines.
 * Returns null when no stamp is drawn.
 */
export function dateStampRect(date, W, H, scale = 1) {
  const text = dateStampText(date)
  if (!date?.enabled || !text) return null

  const fontSize = dateFontSize(W, H, date.size)
  if (!measurer) measurer = document.createElement('canvas').getContext('2d')
  measurer.font = dateFontCss(fontSize)

  const w = measurer.measureText(text).width
  const h = fontSize * 1.2
  const a = dateAnchor(date, W, H, scale)
  return {
    x: a.align === 'right' ? a.x - w : a.x,
    y: a.baseline === 'bottom' ? a.y - h : a.y,
    w,
    h,
  }
}

/**
 * Date stamp, drawn last so it sits above photos and borders alike.
 */
function drawDateStamp(ctx, W, H, date, scale) {
  const text = dateStampText(date)
  if (!date?.enabled || !text) return

  const fontSize = dateFontSize(W, H, date.size)
  const a = dateAnchor(date, W, H, scale)
  ctx.save()
  ctx.font = dateFontCss(fontSize)
  ctx.fillStyle = date.color
  ctx.textAlign = a.align
  ctx.textBaseline = a.baseline

  // A soft dark halo keeps the stamp readable over pale photos without
  // looking like a drop shadow at export size.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = Math.max(1, fontSize * 0.12)
  ctx.shadowOffsetY = Math.max(1, fontSize * 0.04)

  ctx.fillText(text, a.x, a.y)
  ctx.restore()
}

/**
 * Draw the whole composite onto `canvas`.
 * `scale` < 1 renders a preview; the exported image always uses scale 1.
 */
export function renderComposite(canvas, spec, scale = 1) {
  const { cells, photos, width, height, gap, padding, bgColor, date } = spec

  const W = Math.max(1, Math.round(width * scale))
  const H = Math.max(1, Math.round(height * scale))
  canvas.width = W
  canvas.height = H

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, W, H)

  const rects = cellRects({ ...spec, gap: gap * scale, padding: padding * scale, width: W, height: H })
  const byId = new Map(photos.map((p) => [p.id, p]))

  rects.forEach((rect, i) => {
    const cell = cells[i]
    const photo = cell && cell.photoId ? byId.get(cell.photoId) : null
    if (!photo) return
    drawInCell(ctx, photo.img, rect, cell, bgColor)
  })

  drawDateStamp(ctx, W, H, date, scale)

  return rects
}
