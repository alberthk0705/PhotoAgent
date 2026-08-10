// Minimal EXIF reader — just enough to answer "when was this taken?".
//
// File.lastModified is the filesystem timestamp, which for photos copied off a
// camera or phone is usually the copy date, not the capture date. EXIF
// DateTimeOriginal is the real one, so try that first and fall back.

const TAG_DATETIME = 0x0132 // IFD0, "when the file was changed"
const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME_ORIGINAL = 0x9003 // when the shutter fired
const TAG_DATETIME_DIGITIZED = 0x9004

// EXIF lives near the front of the file; no need to read a 40 MB photo.
const HEAD_BYTES = 256 * 1024

function readAscii(view, offset, length) {
  let out = ''
  for (let i = 0; i < length; i++) {
    const c = view.getUint8(offset + i)
    if (c === 0) break
    out += String.fromCharCode(c)
  }
  return out
}

/** EXIF dates look like "2026:03:14 09:21:07" and are local time, no zone. */
function parseExifDate(text) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  const date = new Date(y, mo - 1, d, h, mi, s)
  return Number.isNaN(date.getTime()) ? null : date
}

function readIfd(view, tiffStart, ifdOffset, little, wanted) {
  const found = {}
  if (ifdOffset + 2 > view.byteLength) return found

  const count = view.getUint16(tiffStart + ifdOffset, little)
  for (let i = 0; i < count; i++) {
    const entry = tiffStart + ifdOffset + 2 + i * 12
    if (entry + 12 > view.byteLength) break

    const tag = view.getUint16(entry, little)
    if (!wanted.includes(tag)) continue

    const type = view.getUint16(entry + 2, little)
    const length = view.getUint32(entry + 4, little)

    if (type === 4 || type === 3) {
      // LONG / SHORT — used for the sub-IFD pointer
      found[tag] = type === 4 ? view.getUint32(entry + 8, little) : view.getUint16(entry + 8, little)
    } else if (type === 2) {
      // ASCII — inline when it fits in the 4-byte value slot, otherwise at an offset
      const at = length <= 4 ? entry + 8 : tiffStart + view.getUint32(entry + 8, little)
      if (at >= 0 && at + Math.min(length, 32) <= view.byteLength) {
        found[tag] = readAscii(view, at, length)
      }
    }
  }
  return found
}

/**
 * Capture date from a JPEG's EXIF block, or null when there isn't one
 * (PNG, HEIC, screenshots, stripped metadata — all normal).
 */
export async function readCaptureDate(file) {
  try {
    const buffer = await file.slice(0, HEAD_BYTES).arrayBuffer()
    const view = new DataView(buffer)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null // not a JPEG

    // Walk the JPEG segment chain looking for APP1/Exif.
    let offset = 2
    let tiffStart = -1
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break
      const marker = view.getUint8(offset + 1)
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      if (marker === 0xda) break // start of scan: pixel data from here on

      const size = view.getUint16(offset + 2)
      if (marker === 0xe1 && readAscii(view, offset + 4, 4) === 'Exif') {
        tiffStart = offset + 10
        break
      }
      offset += 2 + size
    }
    if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return null

    const endian = view.getUint16(tiffStart)
    if (endian !== 0x4949 && endian !== 0x4d4d) return null
    const little = endian === 0x4949
    if (view.getUint16(tiffStart + 2, little) !== 42) return null

    const ifd0Offset = view.getUint32(tiffStart + 4, little)
    const ifd0 = readIfd(view, tiffStart, ifd0Offset, little, [TAG_DATETIME, TAG_EXIF_IFD])

    if (ifd0[TAG_EXIF_IFD]) {
      const exif = readIfd(view, tiffStart, ifd0[TAG_EXIF_IFD], little, [
        TAG_DATETIME_ORIGINAL,
        TAG_DATETIME_DIGITIZED,
      ])
      const shot = exif[TAG_DATETIME_ORIGINAL] || exif[TAG_DATETIME_DIGITIZED]
      if (shot) {
        const parsed = parseExifDate(shot)
        if (parsed) return parsed
      }
    }

    return ifd0[TAG_DATETIME] ? parseExifDate(ifd0[TAG_DATETIME]) : null
  } catch {
    return null // a malformed header should never stop an import
  }
}

/** yyyy.mm.dd — the stamp format. */
export function formatStampDate(date) {
  if (!date) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}.${p(date.getMonth() + 1)}.${p(date.getDate())}`
}

/** yyyy-mm-dd, for binding to <input type="date">. */
export function toDateInputValue(date) {
  if (!date) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function stampFromInputValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : ''
}
