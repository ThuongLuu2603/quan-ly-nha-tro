export function formatMoney(amount: number): string {
  const rounded = Math.round(amount)
  return new Intl.NumberFormat('vi-VN').format(rounded)
}

export function formatMoneyWithUnit(amount: number): string {
  return `${formatMoney(amount)} đ`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)
}

/** Chi giu chu so, dung cho o nhap tien co dau cham phan cach. */
export function parseMoneyInput(raw: string): number {
  const digits = raw.replace(/[^\d-]/g, '')
  if (!digits || digits === '-') return 0
  return Number(digits)
}

/** Chi so cong to / so nguyen co dau cham phan cach nghin. */
export function parseNumberInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\./g, '').replace(/,/g, '.')
  if (!normalized) return null
  const cleaned = normalized.replace(/[^\d.]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const UNITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

function readTriple(n: number, forceHundred: boolean): string {
  const hundred = Math.floor(n / 100)
  const ten = Math.floor((n % 100) / 10)
  const unit = n % 10
  const parts: string[] = []

  if (hundred > 0 || forceHundred) {
    parts.push(`${UNITS[hundred]} trăm`)
  }
  if (ten === 0) {
    if (unit > 0 && (hundred > 0 || forceHundred)) parts.push('lẻ', UNITS[unit])
    else if (unit > 0) parts.push(UNITS[unit])
  } else if (ten === 1) {
    parts.push('mười')
    if (unit === 5) parts.push('lăm')
    else if (unit === 1) parts.push('một')
    else if (unit > 0) parts.push(UNITS[unit])
  } else {
    parts.push(`${UNITS[ten]} mươi`)
    if (unit === 1) parts.push('mốt')
    else if (unit === 5) parts.push('lăm')
    else if (unit > 0) parts.push(UNITS[unit])
  }
  return parts.join(' ')
}

const SCALES = ['', ' nghìn', ' triệu', ' tỷ']

/** Doc so tien thanh chu, dung o dong "bang chu" tren phieu. */
export function moneyToWords(amount: number): string {
  const value = Math.round(Math.abs(amount))
  if (value === 0) return 'Không đồng'

  const triples: number[] = []
  let rest = value
  while (rest > 0) {
    triples.push(rest % 1000)
    rest = Math.floor(rest / 1000)
  }

  const chunks: string[] = []
  for (let i = triples.length - 1; i >= 0; i--) {
    if (triples[i] === 0) continue
    const forceHundred = i < triples.length - 1
    chunks.push(readTriple(triples[i], forceHundred) + (SCALES[i] ?? ''))
  }

  const text = chunks.join(' ').replace(/\s+/g, ' ').trim()
  const sign = amount < 0 ? 'Âm ' : ''
  return `${sign}${text.charAt(0).toUpperCase()}${text.slice(1)} đồng`
}
