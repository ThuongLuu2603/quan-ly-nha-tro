export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Web khong cho tu gui tin nhan thay nguoi dung. Nut nay mo khay chia se cua
 * Android de chon Zalo, may nao khong ho tro thi tai anh ve.
 */
export async function shareImage(blob: Blob, filename: string, text: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' })
  const canShareFiles =
    typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  if (canShareFiles && navigator.share) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  downloadBlob(blob, filename)
  return 'downloaded'
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

export function normalizePhoneForZalo(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`
  return digits
}

/** Mo chat Zalo toi so da luu (nguoi dai dien / khach). */
export function zaloChatUrl(phone: string): string {
  return `https://zalo.me/${normalizePhoneForZalo(phone)}`
}

/** Mo app Zalo tren dien thoai; tren may tinh mo tab zalo.me. */
export function openZaloChat(phone: string): void {
  window.location.assign(zaloChatUrl(phone))
}
