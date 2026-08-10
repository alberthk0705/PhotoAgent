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

export function makeCell() {
  return { photoId: null, fit: 'cover', fx: 0.5, fy: 0.5 }
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

/**
 * Source rectangle of `img` that fills a w×h cell, honouring the focal point.
 * Only meaningful for fit: 'cover'.
 */
export function coverSourceRect(img, w, h, fx = 0.5, fy = 0.5) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const cellRatio = w / h
  let sw, sh
  if (iw / ih > cellRatio) {
    sh = ih
    sw = sh * cellRatio
  } else {
    sw = iw
    sh = sw / cellRatio
  }
  return { sx: (iw - sw) * fx, sy: (ih - sh) * fy, sw, sh }
}

function drawInCell(ctx, img, rect, cell, bgColor) {
  const { x, y, w, h } = rect
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  if (cell.fit === 'contain') {
    // The cell keeps its own background so gaps and letterbox bars match.
    ctx.fillStyle = bgColor
    ctx.fillRect(x, y, w, h)
    const ratio = img.naturalWidth / img.naturalHeight
    let dw, dh
    if (ratio > w / h) {
      dw = w
      dh = w / ratio
    } else {
      dh = h
      dw = h * ratio
    }
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  } else {
    const { sx, sy, sw, sh } = coverSourceRect(img, w, h, cell.fx, cell.fy)
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  }

  ctx.restore()
}

/**
 * Date stamp, drawn last so it sits above photos and borders alike.
 * Sizes are relative to the output's short side, so the stamp keeps its
 * proportions whether you export at 800 px or 8000 px.
 */
function drawDateStamp(ctx, W, H, date, scale) {
  if (!date?.enabled || !date.text) return

  const fontSize = Math.max(6, Math.round((Math.min(W, H) * date.size) / 100))
  const margin = date.margin * scale
  ctx.save()
  ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
  ctx.fillStyle = date.color
  ctx.textAlign = date.corner === 'tr' || date.corner === 'br' ? 'right' : 'left'
  ctx.textBaseline = date.corner === 'bl' || date.corner === 'br' ? 'bottom' : 'top'

  // A soft dark halo keeps the stamp readable over pale photos without
  // looking like a drop shadow at export size.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = Math.max(1, fontSize * 0.12)
  ctx.shadowOffsetY = Math.max(1, fontSize * 0.04)

  const x = ctx.textAlign === 'right' ? W - margin : margin
  const y = ctx.textBaseline === 'bottom' ? H - margin : margin
  ctx.fillText(date.text, x, y)
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
