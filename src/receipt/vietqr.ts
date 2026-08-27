import QRCode from 'qrcode'

/** CRC16-CCITT (FALSE) theo dung chuan EMVCo. */
function crc16(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

/** Noi dung chuyen khoan phai la ASCII khong dau. */
export function toAscii(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
}

export interface VietQRInput {
  bankBin: string
  accountNo: string
  amount?: number
  message?: string
}

/**
 * Chuoi EMVCo cho ma VietQR chuyen khoan nhanh. Tu sinh nen khong can mang.
 */
export function buildVietQRPayload({ bankBin, accountNo, amount, message }: VietQRInput): string {
  const beneficiary = tlv('00', bankBin) + tlv('01', accountNo)
  const merchantAccount =
    tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA')

  let payload =
    tlv('00', '01') +
    tlv('01', amount && amount > 0 ? '12' : '11') +
    tlv('38', merchantAccount) +
    tlv('53', '704')

  if (amount && amount > 0) payload += tlv('54', String(Math.round(amount)))
  payload += tlv('58', 'VN')

  const note = toAscii(message ?? '').slice(0, 50)
  if (note) payload += tlv('62', tlv('08', note))

  const withCrcId = `${payload}6304`
  return `${withCrcId}${crc16(withCrcId)}`
}

export async function vietQRDataUrl(input: VietQRInput): Promise<string | null> {
  if (!input.bankBin || !input.accountNo) return null
  try {
    return await QRCode.toDataURL(buildVietQRPayload(input), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 480,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
  } catch {
    return null
  }
}
