import { paidAmount } from '../domain/billing'
import * as dt from '../domain/dates'
import { formatMoney, moneyToWords } from '../domain/money'
import type { Invoice, Room, Settings } from '../domain/types'

const SCALE = 2
const WIDTH = 780
const PAD = 40
const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#cbd5e1'
const ACCENT = '#0d9488'

export interface ReceiptData {
  settings: Settings
  room: Room
  invoice: Invoice
  occupants: string[]
  qrDataUrl?: string | null
  rentPaidThroughNote?: string
  transferNote?: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function title(invoice: Invoice): string {
  if (invoice.kind === 'moveIn') return 'PHIẾU NHẬN PHÒNG'
  if (invoice.kind === 'checkout') return 'PHIẾU TẤT TOÁN TRẢ PHÒNG'
  return 'PHIẾU THU TIỀN PHÒNG'
}

export async function renderReceipt(data: ReceiptData): Promise<Blob> {
  const { settings, room, invoice, occupants, qrDataUrl } = data

  const scratch = document.createElement('canvas')
  scratch.width = WIDTH * SCALE
  scratch.height = 2600 * SCALE
  const ctx = scratch.getContext('2d')
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ vẽ ảnh phiếu')
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, 2600)

  const contentWidth = WIDTH - PAD * 2
  let y = PAD

  const text = (
    value: string,
    options: {
      size?: number
      weight?: string
      color?: string
      align?: CanvasTextAlign
      x?: number
      lineHeight?: number
      maxWidth?: number
    } = {},
  ) => {
    const size = options.size ?? 19
    const weight = options.weight ?? '400'
    ctx.font = `${weight} ${size}px "Segoe UI", Roboto, Arial, sans-serif`
    ctx.fillStyle = options.color ?? INK
    ctx.textAlign = options.align ?? 'left'
    const x = options.x ?? (options.align === 'center' ? WIDTH / 2 : options.align === 'right' ? WIDTH - PAD : PAD)
    const lineHeight = options.lineHeight ?? size * 1.45
    const lines = wrap(ctx, value, options.maxWidth ?? contentWidth)
    for (const l of lines) {
      ctx.fillText(l, x, y + size)
      y += lineHeight
    }
  }

  const divider = (gap = 14) => {
    y += gap
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(WIDTH - PAD, y)
    ctx.stroke()
    y += gap
  }

  const row = (label: string, amount: string, options: { bold?: boolean; size?: number; color?: string } = {}) => {
    const size = options.size ?? 20
    const weight = options.bold ? '700' : '400'
    ctx.font = `${weight} ${size}px "Segoe UI", Roboto, Arial, sans-serif`
    ctx.fillStyle = options.color ?? INK
    ctx.textAlign = 'right'
    ctx.fillText(amount, WIDTH - PAD, y + size)
    ctx.textAlign = 'left'
    const amountWidth = ctx.measureText(amount).width
    const labelLines = wrap(ctx, label, contentWidth - amountWidth - 24)
    labelLines.forEach((l, i) => ctx.fillText(l, PAD, y + size + i * size * 1.35))
    y += size * 1.35 * Math.max(1, labelLines.length) + 8
  }

  text(settings.landlordName || 'Nhà trọ', { size: 28, weight: '700' })
  const contact = [settings.address, settings.phone].filter(Boolean).join(' · ')
  if (contact) text(contact, { size: 16, color: MUTED })

  y += 10
  text(title(invoice), { size: 25, weight: '700', align: 'center', color: ACCENT })
  y += 4
  text(`Ngày lập phiếu ${dt.formatDate(invoice.issueDate)}  ·  Mã ${invoice.code}`, {
    size: 16,
    color: MUTED,
    align: 'center',
  })

  divider()

  text(`Phòng ${room.name}`, { size: 24, weight: '700' })
  if (occupants.length) {
    text(occupants.join(', '), { size: 18, color: MUTED })
    if (occupants.length > 1) text(`${occupants.length} người lưu trú`, { size: 15, color: MUTED })
  }

  divider()

  for (const l of invoice.lines) {
    row(l.label, `${formatMoney(l.amount)} đ`)
    if (l.detail) {
      y -= 4
      text(l.detail, { size: 15, color: MUTED })
      y += 4
    }
  }

  if (data.rentPaidThroughNote) {
    y += 2
    text(data.rentPaidThroughNote, { size: 15, color: ACCENT })
  }

  divider()

  const isRefund = invoice.total < 0
  row(isRefund ? 'CHỦ TRỌ TRẢ LẠI' : 'TỔNG CỘNG', `${formatMoney(Math.abs(invoice.total))} đ`, {
    bold: true,
    size: 27,
    color: isRefund ? '#b45309' : INK,
  })
  text(`Bằng chữ: ${moneyToWords(Math.abs(invoice.total))}`, { size: 16, color: MUTED })

  const paid = paidAmount(invoice)
  if (Math.abs(paid) >= 1) {
    y += 6
    row('Đã thanh toán', `${formatMoney(Math.abs(paid))} đ`, { size: 18 })
    row('Còn lại', `${formatMoney(Math.abs(invoice.total - paid))} đ`, { size: 18, bold: true })
  }

  if (qrDataUrl && !isRefund) {
    divider()
    const qrSize = 190
    const qrY = y
    try {
      const img = await loadImage(qrDataUrl)
      ctx.drawImage(img, PAD, qrY, qrSize, qrSize)
    } catch {
      // khong ve duoc QR thi bo qua, phan chu ben canh van du thong tin
    }
    const infoX = PAD + qrSize + 22
    const infoWidth = contentWidth - qrSize - 22
    const savedY = y
    y = qrY + 6
    text('Quét mã để chuyển khoản', {
      size: 18,
      weight: '700',
      x: infoX,
      maxWidth: infoWidth,
    })
    if (settings.bankAccountName) {
      text(settings.bankAccountName.toUpperCase(), { size: 16, x: infoX, maxWidth: infoWidth })
    }
    if (settings.bankAccountNo) {
      text(`STK ${settings.bankAccountNo}`, { size: 16, x: infoX, maxWidth: infoWidth, color: MUTED })
    }
    if (data.transferNote) {
      text(`Nội dung: ${data.transferNote}`, { size: 16, x: infoX, maxWidth: infoWidth, color: MUTED })
    }
    y = Math.max(savedY + qrSize, y)
  }

  if (settings.invoiceFooter) {
    divider()
    text(settings.invoiceFooter, { size: 15, color: MUTED, align: 'center' })
  }

  y += PAD

  const output = document.createElement('canvas')
  output.width = WIDTH * SCALE
  output.height = Math.round(y * SCALE)
  const outCtx = output.getContext('2d')
  if (!outCtx) throw new Error('Trình duyệt không hỗ trợ vẽ ảnh phiếu')
  outCtx.fillStyle = '#ffffff'
  outCtx.fillRect(0, 0, output.width, output.height)
  outCtx.drawImage(scratch, 0, 0, output.width, output.height, 0, 0, output.width, output.height)

  return await new Promise<Blob>((resolve, reject) => {
    output.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Không tạo được ảnh phiếu'))
    }, 'image/png')
  })
}
