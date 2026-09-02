# PhotoAgent — status

Snapshot of where the project stands. `README.md` covers how it works; this file covers what is done, what is
known-broken, and what is worth doing next.

**Last updated:** 2026-09-02 · **Head:** `72a3310` · **Live:** https://alberthk0705.github.io/PhotoAgent/

## At a glance

| | |
|---|---|
| Repository | `alberthk0705/PhotoAgent` — **public** |
| Hosting | GitHub Pages, deployed by Actions on every push to `main` |
| Last deploy | ✅ success (`c6392b3`) |
| Commits | 8 |
| Stack | React 19 · Vite 8 · Tailwind 4 · MediaPipe tasks-vision |
| Server-side code | None. Everything runs in the browser; no image ever leaves the device |

## Shipped

- **Merge** — 7 layouts (1×2, 2×1, 2×2, 2×4, 4×2, 3×3, 4×4), any output size 16–8000 px, adjustable gap, outer
  border and border colour, PNG export at exactly the requested size.
- **Per-cell framing** — Cover/Contain, drag to reposition, zoom by wheel, pinch or slider (Cover 1–8×,
  Contain 0.2–8×), anchored on the pointer.
- **Swapping cells** — a ⠿ handle on each filled cell; drag it onto another cell to trade the two photos, framing
  included, or onto an empty one to move.
- **Date stamp** — one `yyyy.mm.dd` on the composite, seeded from EXIF capture date, with colour, corner and
  margin controls; size scales with the export. Draggable on the preview (or nudged with the arrow keys) to any
  free position, stored as a fraction of the output; a corner button puts it back on corner-and-margin placement.
- **Crop** — move/resize with aspect locks, rule-of-thirds guides, saves as a new photo or downloads.
- **Head detection** — MediaPipe BlazeFace; boxes to pick from, "fit all heads" with a largest-head fallback.
- **Tags** — automatic on-device classification on import, with tag-chip and text filtering of the library.
- **Persistence** — library and in-progress collage in IndexedDB; survives reload and tab discard.
- **Languages** — English and Traditional Chinese, following the browser, remembered across reloads.
- **Touch** — stacked layout below 1024 px, touch-action on drag surfaces, finger-sized crop handles.

## Weight

| | Size | When it downloads |
|---|---|---|
| App bundle | 81.1 kB gzip (255.7 kB raw) | always |
| CSS | 6.4 kB gzip | always |
| MediaPipe JS chunk | 45.3 kB gzip | first head-detect or tagging |
| WASM runtime | 11 MB raw / **3.3 MB gzip** | first head-detect or tagging |
| Face model | 228 kB | first head-detect |
| Classifier model | 6.0 MB | first import with auto-tag on |

The core app stays small; the models are lazy. Note that auto-tagging is **on by default**, so a first-time user
who imports a photo pays roughly 9 MB over the wire before any tag appears.

## Requirements

- **Browsers:** Safari 16.4+, Chrome 111+, Firefox 128+ (floor set by Tailwind 4). iPadOS 16.4+.
- **Build:** Node `^20.19 || >=22.12`.
- `dist/` must be served over HTTP — `file://` blocks ES modules.

## Known limitations

1. **Tagging is useless on people.** ImageNet has no `person` class, so portraits match the nearest object:
   measured `band aid`, `brassiere`, `dumbbell` on real photos. Non-person subjects are accurate
   (`labrador retriever`, `sea lion`, `alp`, `pickup`). Fix is to add the COCO object detector
   (EfficientDet-Lite0, 4.4 MB), whose first class is `person`. **Highest-value open item.**
2. **`MAX_SIZE` is 8000 px, but iOS Safari caps a single canvas at ~16.7 M pixels.** An 8000 × 8000 export is
   64 MP and is expected to fail — silently — on iPad while working on desktop. Flagged early, never fixed, and
   **never verified on a real device.** The safe ceiling is about 4096 × 4096. Either clamp per platform or warn.
3. **Touch: the preview cannot be scrolled past.** Cells holding a photo claim drag and pinch, so on a full
   4×4 grid the only way to scroll is from the settings panel, empty cells or the margins. Unavoidable if pinch is
   to reach the app, but a dedicated scroll affordance would help.
4. **Export is PNG only** — no JPEG or quality control. PNGs of photos are large.
5. **No drag-to-reorder** between cells; clear a cell and reassign instead.
6. **Clicking a photo overwrites the selected cell**, even if occupied. Correct by design, but easy to do by
   accident when the selection is not where you think.
7. **Head detection needs reasonably large, front-facing faces** — BlazeFace short-range. Profiles and small or
   occluded faces are missed.
8. **The repository is public.** GitHub Pages will not serve a private repo on a free plan. Consequently the
   author email in the commit history is public too.
9. **Actions deprecation warnings** — `actions/checkout@v4`, `setup-node@v4`, `configure-pages@v5`,
   `upload-artifact@v4` and `deploy-pages@v4` target Node 20, which runners now force to 24. Harmless today; will
   break when GitHub completes the removal.

## Test coverage

88 automated checks across 6 Playwright suites, all passing against the production build in Chromium:

| Suite | Checks | Covers |
|---|---|---|
| 1 | 12 | import, export at requested size, head detection, crop snapping, aspect lock |
| 2 | 19 | new layouts, date stamp (verified by canvas pixels), size-input fix, language switching |
| 3 | 16 | iPad portrait via CDP touch events — drag, pinch, scroll hand-off, handle sizing |
| 4 | 12 | IndexedDB persistence, pixel-identical restore, deletion, clearing |
| 5 | 15 | zoom by slider/wheel, pointer anchoring, clamping, reset, persistence |
| 6 | 14 | automatic tagging, storage, filtering, and the auto-tag switch |

> ⚠️ **These suites are not in the repository.** They live in a scratchpad outside the project and will be lost.
> Committing them under `e2e/` — and running them in CI — is the most valuable piece of unfinished work after
> item 1 above. Nothing currently guards against regressions on a fresh clone.

Verification has only ever run in **Chromium**. No suite has run in Safari or on physical hardware, so every
iPad claim rests on emulation.

## Suggested next steps

1. Add the COCO object detector so people can be tagged (limitation 1).
2. Commit the Playwright suites to `e2e/` and run them in CI (see warning above).
3. Clamp or warn on export sizes above ~4096 px on iOS (limitation 2).
4. Verify on a real iPad — the one gap emulation cannot close.
5. JPEG export with a quality slider, to make large collages shareable.
