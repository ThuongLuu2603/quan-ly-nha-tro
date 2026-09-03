/** Khổ A4 300 DPI — in máy in thường dùng. */
export const A4_WIDTH = 2480
export const A4_HEIGHT = 3508
export const RECEIPTS_PER_A4_PAGE = 4

const MARGIN = 56
const GAP = 24

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Không tạo được ảnh trang in'))
    }, 'image/png')
  })
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Không đọc được ảnh phiếu'))
    }
    img.src = url
  })
}

/** Xếp từng phiếu (khổ ~A6) vào lưới 2×2 trên tờ A4. */
export async function composeA4PrintPages(receiptBlobs: Blob[]): Promise<Blob[]> {
  if (receiptBlobs.length === 0) return []

  const images = await Promise.all(receiptBlobs.map(loadImageFromBlob))
  const slotW = (A4_WIDTH - MARGIN * 2 - GAP) / 2
  const slotH = (A4_HEIGHT - MARGIN * 2 - GAP) / 2
  const pages: Blob[] = []

  for (let pageStart = 0; pageStart < images.length; pageStart += RECEIPTS_PER_A4_PAGE) {
    const canvas = document.createElement('canvas')
    canvas.width = A4_WIDTH
    canvas.height = A4_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ vẽ trang in')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT)

    for (let slot = 0; slot < RECEIPTS_PER_A4_PAGE; slot++) {
      const img = images[pageStart + slot]
      if (!img) break

      const col = slot % 2
      const row = Math.floor(slot / 2)
      const x = MARGIN + col * (slotW + GAP)
      const y = MARGIN + row * (slotH + GAP)

      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, slotW, slotH)

      const scale = Math.min(slotW / img.width, slotH / img.height)
      const drawW = img.width * scale
      const drawH = img.height * scale
      const dx = x + (slotW - drawW) / 2
      const dy = y + (slotH - drawH) / 2
      ctx.drawImage(img, dx, dy, drawW, drawH)
    }

    pages.push(await canvasToBlob(canvas))
  }

  return pages
}

export function openPrintDialog(pageBlobs: Blob[]): void {
  if (pageBlobs.length === 0) return

  const urls = pageBlobs.map((blob) => URL.createObjectURL(blob))
  const pages = urls.map((url) => `<div class="page"><img src="${url}" alt="" /></div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>In phiếu A4</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { background: #fff; }
    .page {
      width: 210mm;
      height: 297mm;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
    img { width: 100%; height: 100%; object-fit: contain; display: block; }
  </style>
</head>
<body>${pages}</body>
</html>`

  document.getElementById('qlnt-print-frame')?.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'qlnt-print-frame'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = 'In phiếu A4'
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'

  const cleanup = () => {
    urls.forEach(URL.revokeObjectURL)
    iframe.remove()
  }

  iframe.addEventListener('load', () => {
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    if (!win || !doc) return

    const waitImages = Promise.all(
      Array.from(doc.images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve()
              return
            }
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }),
      ),
    )

    void waitImages.then(() => {
      window.setTimeout(() => {
        win.focus()
        win.print()
      }, 80)
    })
  })

  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    cleanup()
    throw new Error('Trình duyệt không hỗ trợ in nội bộ')
  }

  doc.open()
  doc.write(html)
  doc.close()

  // Giữ blob đủ lâu để hộp thoại in tải ảnh; dọn sau.
  window.setTimeout(cleanup, 180_000)
}

