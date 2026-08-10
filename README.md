# PhotoAgent

A browser-based photo tool for merging photos into a grid and cropping them. Everything runs client-side —
images are decoded, composed and exported in the browser, and nothing is uploaded anywhere.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run build` produces a static bundle in `dist/` that can be served from any static host. It must be served
over HTTP — opening `dist/index.html` directly via `file://` fails, because browsers block ES modules there.

To try it on a phone or tablet on the same network, run `npm run dev -- --host` and open the printed LAN address.

## Deploying

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. Enable it
once under **Settings → Pages → Source → GitHub Actions**.

Pages serves a project site from `https://<user>.github.io/<repo>/`, so `vite.config.js` sets
`base: '/PhotoAgent/'`. **If the repository is renamed, that value must change to match** — a mismatch produces a
blank page with 404s on the JS and CSS. For a `<user>.github.io` repo, or any host serving from the domain root,
use `base: '/'`.

## What it does

**Library** — import photos with the button, or drop files anywhere on the window. "Remove" clears one out (and
empties any cell using it); "Clear library" removes everything from the device.

**Merge**

- Layouts: `1 × 2`, `2 × 1`, `2 × 2`, `2 × 4`, `4 × 2`, `3 × 3`, `4 × 4` (rows × columns). Photos keep their
  cell assignments when you switch between layouts.
- Click a cell in the preview to select it, then click a photo in the library to place it there. Selection then
  advances to the next empty cell, so filling a grid is one click per photo.
- Output size is any value from 16 to 8000 px per side, with presets and a width/height swap. The fields accept
  free typing and only clamp when you commit with Enter or by clicking away. The preview is a scaled render of
  exactly what gets exported.
- **Cover** fills the cell and crops the overflow. **Contain** fits the whole photo and pads with the border
  colour. The toggle is per cell.
- **Framing each cell**: drag the photo to reposition it, and zoom with the scroll wheel, a two-finger pinch, or
  the slider. Zoom anchors on the pointer or the pinch centre, so the photo grows around what you are looking at
  rather than drifting away. Cover stops at 1× — below that it would no longer cover — while Contain goes down to
  0.2×, letting a photo float inside the cell with the border colour around it. "Reset view" returns to 1× and
  centred.
- Gap (between cells), outer border, and border colour are adjustable.
- **Date stamp**: one `yyyy.mm.dd` stamp on the finished composite. It is seeded from the first imported photo's
  EXIF capture date (falling back to the file's timestamp) and can be set to any date you like. Colour, corner and
  margin are adjustable, and the size is a percentage of the output's short side so it scales with the export.
- Export writes a PNG at the exact output size.

**Head detection**

Both views have a "Detect heads" action. It finds faces, expands each box to cover the whole head (hair and
chin), and shows them as numbered green boxes for you to click — nothing is repositioned automatically.

- In **Merge**, on a Cover cell, picking a head centres it in the cell. "Fit all N heads" frames every head at
  once, falling back to the largest when the group can't fit the cell's crop.
- In **Crop**, picking a head snaps the crop rectangle around it with padding, respecting any aspect lock.

It runs on [MediaPipe](https://ai.google.dev/edge/mediapipe) BlazeFace, with the WASM runtime and model served
from this site rather than a CDN — so detection, like everything else, happens on your device. Those assets
(~3.5 MB gzipped) are loaded on first use only, so visitors who never press the button never download them.

**Crop**

- Drag inside the box to move it, grab a handle to resize; optional aspect-ratio lock.
- "Save crop as new photo" adds the cropped region to the library as a separate photo — the original is
  untouched, and the crop is immediately available for merging. "Download PNG" saves it to disk instead.

## Persistence

The library and the in-progress collage are kept in IndexedDB, so a reload — or iPadOS discarding the tab under
memory pressure — doesn't lose your work. Photos are stored as their original Blobs; re-encoding would cost
quality and EXIF for nothing. Cell assignments, layout, output size, spacing, colours and the date stamp are saved
alongside them, debounced so dragging a slider isn't a write per frame.

This is ordinary per-origin browser storage on your own device — nothing is uploaded.

Failure modes are handled rather than ignored: a photo whose blob won't decode is skipped, and any cell pointing at
it is emptied instead of left with a dangling reference. If the quota is exceeded, or the browser blocks storage
entirely (private browsing), the app keeps working in memory and says so in the library footer.

## On tablets and phones

The layout stacks below 1024 px: the library becomes a horizontal strip, the settings panel moves under the
preview, and both scroll. Beyond width, touch needed three specific things:

- **`touch-action: none` on drag surfaces.** Without it a touch-drag is claimed by the scroller and the browser
  cancels the pointer, so panning a photo or moving the crop box just scrolled the page. It is applied only to
  surfaces that actually drag — an empty cell keeps `touch-action: auto` so you can still scroll by dragging there.
- **No hover-only controls.** The per-thumbnail Crop/Remove buttons are always visible; they only hide behind
  hover under `@media (hover: hover)`, where a pointer exists to reveal them.
- **Finger-sized handles.** Crop handles grow from 12 px to 22 px under `@media (pointer: coarse)`.

## Language

English and Traditional Chinese, switchable from the header. The initial choice follows the browser's language and
is remembered in `localStorage`. Strings live in `src/lib/i18n.jsx`; a key missing from one language falls back to
English rather than rendering blank.

## Layout of the code

```
src/
  App.jsx                    library + composite state, tab switching, window-level drop
  components/
    PhotoLibrary.jsx         thumbnails, import, per-photo actions
    MergeView.jsx            preview canvas, cell overlays/panning, settings panel
    CropTool.jsx             crop rectangle interaction and export
  lib/
    compose.js               layout geometry + canvas rendering (shared by preview and export)
    images.js                file → photo records, canvas → blob/download helpers
    exif.js                  capture date from JPEG EXIF, and the stamp's date formatting
    store.js                 IndexedDB persistence for the library and composite state
    faces.js                 MediaPipe head detection, loaded on demand
    useHeadDetection.js      per-photo detection state for both views
    i18n.jsx                 translations and the language provider
```

Cover and Contain share one geometry model — they differ only in the baseline scale (fill the cell vs fit inside
it), and zoom multiplies that baseline. Panning, zooming, head-framing and drawing are therefore one code path
rather than two that must be kept in step. `drawInCell` also draws only the slice of the source that lands inside
the cell, so an 8× zoom on a large photo doesn't ask the rasteriser for an enormous surface.

`compose.js` is the single source of truth for how a composite looks: the preview calls `renderComposite` with a
`scale < 1`, the exporter calls it with `scale = 1`. That is why the preview and the exported file always agree.
