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

**Library** — import photos with the button, or drop files anywhere on the window. Photos stay in memory for the
session; "Remove" clears one out (and empties any cell using it).

**Merge**

- Layouts: `1 × 2`, `2 × 1`, `2 × 2` (rows × columns).
- Click a cell in the preview to select it, then click a photo in the library to place it there. Selection then
  advances to the next empty cell, so filling a grid is one click per photo.
- Output size is set in pixels, with presets and a width/height swap. The preview is a scaled render of exactly
  what gets exported.
- **Cover** fills the cell and crops the overflow — drag the photo in the preview to choose which part survives.
  **Contain** fits the whole photo and pads with the border colour. The toggle is per cell.
- Gap (between cells), outer border, and border colour are adjustable.
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
```

`compose.js` is the single source of truth for how a composite looks: the preview calls `renderComposite` with a
`scale < 1`, the exporter calls it with `scale = 1`. That is why the preview and the exported file always agree.
