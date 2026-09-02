import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'zh', label: '繁中', name: '繁體中文' },
]

const STORAGE_KEY = 'photoagent.lang'

const STRINGS = {
  en: {
    // shell
    tagline: 'Everything runs in your browser — no photo ever leaves this machine.',
    tabMerge: 'Merge',
    tabCrop: 'Crop',
    dropToImport: 'Drop images to import',
    language: 'Language',

    // library
    importPhotos: 'Import photos',
    restoring: 'Restoring your library…',
    autoTag: 'Auto-tag new photos',
    tagging: 'Tagging {n} more…',
    tagUnavailable: "Tagging is unavailable — the model couldn't be loaded.",
    filterPlaceholder: 'Filter by tag…',
    showingCount: 'Showing {shown} of {total}',
    clearFilter: 'Clear',
    noMatches: 'No photos match that tag.',
    clearLibrary: 'Clear library',
    clearConfirm: 'Remove all {n} photos from this device? This cannot be undone.',
    savedOnDevice: 'Saved on this device{size}',
    storageFull: "Storage is full — new photos won't survive a reload.",
    storageOff: "This browser isn't saving photos, so they'll be lost on reload.",
    noPhotos: 'No photos yet.',
    noPhotosHint: 'Import, or drop files anywhere.',
    crop: 'Crop',
    remove: 'Remove',
    removeTitle: 'Remove from library',
    hintPlaceInCell: 'Click a photo to place it in cell {n}',
    hintClickToCrop: 'Click a photo to crop it',

    // merge — layout and output
    layout: 'Layout',
    outputSize: 'Output size (px)',
    swapSides: 'Swap width and height',
    presets: 'Presets…',
    presetSquare: 'square',
    sizeRange: 'Any size from {min} to {max} px. Press Enter to apply.',
    gapLabel: 'Gap between cells — {n} px',
    borderLabel: 'Outer border — {n} px',
    borderColour: 'Border colour',
    gapTooLarge: 'The gap and border are larger than the output size — reduce them, or make the output bigger.',

    // merge — cells
    cellOf: 'Cell {n} of {m}',
    cover: 'Cover',
    contain: 'Contain',
    coverHelp: 'Fills the cell and crops the overflow. Drag the photo in the preview to choose what stays.',
    containHelp: 'Shows the whole photo; spare room is filled with the border colour.',
    detectHeadsMenu: 'Detect heads…',
    detectHeadsCoverTitle: 'Find heads in this photo and centre one in the cell',
    detectHeadsContainTitle: 'Only applies to Cover cells — Contain already shows the whole photo',
    zoomLabel: 'Zoom — {n}×',
    resetView: 'Reset view',
    clear: 'Clear',
    emptyCellHint: 'This cell is empty. Click a photo in the library to place it here.',
    cellEmptyBadge: 'Cell {n} — empty',

    // merge — export
    exportPng: 'Export PNG',
    rendering: 'Rendering…',
    cellsFilled: '{filled}/{total} cells filled · output {w} × {h} px',
    dragHint: ' · drag to reposition, scroll or pinch to zoom, drag ⠿ to swap cells',
    swapHandle: 'Drag onto another cell to swap the two photos',
    headsDontFit: "All {n} heads don't fit this cell — framed the largest instead.",

    // date stamp
    dateStamp: 'Date stamp',
    showDate: 'Show date',
    dateValue: 'Date',
    dateColour: 'Colour',
    dateCorner: 'Corner',
    cornerTL: 'Top left',
    cornerTR: 'Top right',
    cornerBL: 'Bottom left',
    cornerBR: 'Bottom right',
    dateMargin: 'Margin — {n} px',
    dateDragHint: 'Drag the date to place it, or nudge it with the arrow keys',
    datePositionCustom: 'Placed by hand — {x}% × {y}%',
    datePositionReset: 'Reset',
    dateSize: 'Size — {n}%',
    dateHelp: "Defaults to the first photo's capture date from EXIF, or its file date. Type over it to set your own.",

    // crop
    photo: 'Photo',
    aspectRatio: 'Aspect ratio',
    free: 'Free',
    selection: 'Selection',
    axisX: 'X',
    axisY: 'Y',
    width: 'Width',
    height: 'Height',
    reset: 'Reset',
    selectAll: 'Select all',
    saveCrop: 'Save crop as new photo',
    downloadPng: 'Download PNG',
    cropInfo: 'Crop {w} × {h} px from {sw} × {sh}',
    savedToLibrary: 'Saved {w} × {h} px to the library.',
    cropHelp:
      'Drag inside the box to move it, or grab a handle to resize. Saving adds the cropped region to the library as a separate photo — the original is never modified.',
    cropEmpty:
      'Select a photo from the library to crop it. The result is saved as a new photo, so the original stays untouched and both stay available for merging.',

    // head detection
    headDetection: 'Head detection',
    detectHeads: 'Detect heads',
    scanning: 'Scanning…',
    fitAllHeads: 'Fit all {n} heads',
    hideBoxes: 'Hide boxes',
    detectLoadingHelp: 'Loading the detector — the first run downloads it, then it is cached.',
    detectIdleHelp: 'Finds faces on your device and crops around them, padding for hair and chin.',
    detectNoneHelp: 'No heads found. Try a photo where faces are larger or more front-facing.',
    detectDoneHelp: 'Click a green box to crop to that head.',
    croppedToHead: 'Cropped to head {n}.',
    croppedToAll: 'Cropped to all {n} heads.',
    cropToHeadN: 'Crop to head {n}',

    // picker
    chooseHead: 'Choose a head to frame',
    pickerLoading: 'Loading the detector and scanning…',
    foundN: '{n} found',
    noneFound: 'No heads found in this photo',
    close: 'Close',
    tryAgain: 'Try again',
    pickerHelp: 'Click a box to centre that head in the cell. Detection runs on your device.',
    frameHeadN: 'Frame head {n}',
  },

  zh: {
    // shell
    tagline: '所有處理都在瀏覽器中完成，照片不會離開這台裝置。',
    tabMerge: '合併',
    tabCrop: '裁切',
    dropToImport: '放開以匯入圖片',
    language: '語言',

    // library
    importPhotos: '匯入照片',
    restoring: '正在還原照片庫…',
    autoTag: '自動為新照片加標籤',
    tagging: '尚有 {n} 張標記中…',
    tagUnavailable: '無法標記：模型載入失敗。',
    filterPlaceholder: '依標籤篩選…',
    showingCount: '顯示 {shown} / {total}',
    clearFilter: '清除',
    noMatches: '沒有符合此標籤的照片。',
    clearLibrary: '清空照片庫',
    clearConfirm: '要從這台裝置移除全部 {n} 張照片嗎？此動作無法復原。',
    savedOnDevice: '已儲存在這台裝置{size}',
    storageFull: '儲存空間已滿，新照片在重新整理後不會保留。',
    storageOff: '此瀏覽器未儲存照片，重新整理後將會遺失。',
    noPhotos: '尚未匯入照片。',
    noPhotosHint: '請按上方按鈕，或將檔案拖曳至任意處。',
    crop: '裁切',
    remove: '移除',
    removeTitle: '從照片庫移除',
    hintPlaceInCell: '點選照片以放入第 {n} 格',
    hintClickToCrop: '點選要裁切的照片',

    // merge — layout and output
    layout: '版面配置',
    outputSize: '輸出尺寸（像素）',
    swapSides: '交換寬高',
    presets: '預設尺寸…',
    presetSquare: '正方形',
    sizeRange: '可輸入 {min} 至 {max} px 的任意尺寸，按 Enter 套用。',
    gapLabel: '格線間距 — {n} px',
    borderLabel: '外框寬度 — {n} px',
    borderColour: '邊框顏色',
    gapTooLarge: '間距與外框已大於輸出尺寸，請調小數值，或加大輸出尺寸。',

    // merge — cells
    cellOf: '第 {n} 格，共 {m} 格',
    cover: '填滿',
    contain: '完整顯示',
    coverHelp: '填滿整格並裁掉超出的部分。可在預覽中拖曳照片，決定要保留哪一部分。',
    containHelp: '完整顯示整張照片，多餘的空間以邊框顏色填滿。',
    detectHeadsMenu: '偵測人頭…',
    detectHeadsCoverTitle: '偵測照片中的人頭，並將其置中於這一格',
    detectHeadsContainTitle: '僅適用於「填滿」模式；「完整顯示」已呈現整張照片',
    zoomLabel: '縮放 — {n}×',
    resetView: '重設檢視',
    clear: '清除',
    emptyCellHint: '這一格是空的。請在左側照片庫點選照片放入。',
    cellEmptyBadge: '第 {n} 格 — 空白',

    // merge — export
    exportPng: '匯出 PNG',
    rendering: '產生中…',
    cellsFilled: '已填 {filled}/{total} 格 · 輸出 {w} × {h} px',
    dragHint: ' · 拖曳可調整位置，滾動或雙指可縮放，拖曳 ⠿ 可互換兩格照片',
    swapHandle: '拖曳到另一格即可互換兩張照片',
    headsDontFit: '{n} 個人頭無法同時放入這一格，已改為對準最大的人頭。',

    // date stamp
    dateStamp: '日期標記',
    showDate: '顯示日期',
    dateValue: '日期',
    dateColour: '顏色',
    dateCorner: '位置',
    cornerTL: '左上',
    cornerTR: '右上',
    cornerBL: '左下',
    cornerBR: '右下',
    dateMargin: '邊距 — {n} px',
    dateDragHint: '拖曳日期即可擺放，也可用方向鍵微調',
    datePositionCustom: '自訂位置 — {x}% × {y}%',
    datePositionReset: '重設',
    dateSize: '字級 — {n}%',
    dateHelp: '預設採用第一張照片的 EXIF 拍攝日期，若無則使用檔案日期。可自行修改。',

    // crop
    photo: '照片',
    aspectRatio: '長寬比',
    free: '自由',
    selection: '選取範圍',
    axisX: 'X',
    axisY: 'Y',
    width: '寬',
    height: '高',
    reset: '重設',
    selectAll: '全選',
    saveCrop: '另存為新照片',
    downloadPng: '下載 PNG',
    cropInfo: '裁切 {w} × {h} px，原圖 {sw} × {sh}',
    savedToLibrary: '已將 {w} × {h} px 存入照片庫。',
    cropHelp: '在框內拖曳可移動，拖曳控制點可調整大小。儲存時會將裁切結果另存為新照片，原始照片不會被更動。',
    cropEmpty: '請從照片庫選擇一張照片進行裁切。裁切結果會另存為新照片，原始照片保持不變，兩者都可用於合併。',

    // head detection
    headDetection: '人頭偵測',
    detectHeads: '偵測人頭',
    scanning: '掃描中…',
    fitAllHeads: '涵蓋全部 {n} 個人頭',
    hideBoxes: '隱藏標框',
    detectLoadingHelp: '正在載入偵測模型：第一次執行需下載，之後會由瀏覽器快取。',
    detectIdleHelp: '在本機偵測人臉，並自動為頭髮與下巴預留空間。',
    detectNoneHelp: '找不到人頭。請改用人臉較大或較正面的照片。',
    detectDoneHelp: '點選綠色方框即可裁切該人頭。',
    croppedToHead: '已裁切至第 {n} 個人頭。',
    croppedToAll: '已裁切至全部 {n} 個人頭。',
    cropToHeadN: '裁切至第 {n} 個人頭',

    // picker
    chooseHead: '選擇要對準的人頭',
    pickerLoading: '正在載入偵測模型並掃描…',
    foundN: '找到 {n} 個',
    noneFound: '這張照片中找不到人頭',
    close: '關閉',
    tryAgain: '重試',
    pickerHelp: '點選方框即可將該人頭置中於這一格。偵測完全在您的裝置上執行。',
    frameHeadN: '對準第 {n} 個人頭',
  },
}

function interpolate(template, params) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match))
}

function detectInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && STRINGS[saved]) return saved
    return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(detectInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // private browsing — the choice just won't survive a reload
    }
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en'
  }, [lang])

  const value = useMemo(
    () => ({
      lang,
      setLang,
      // Fall back to English for any key a translation is missing, never a blank label.
      t: (key, params) => interpolate(STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key, params),
    }),
    [lang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useT() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useT must be used inside <LanguageProvider>')
  return ctx
}
