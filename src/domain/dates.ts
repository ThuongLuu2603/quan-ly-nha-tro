import type { ISODate, Period } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function makeISO(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function parseISO(iso: ISODate): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y, month: m, day: d }
}

export function today(): ISODate {
  const now = new Date()
  return makeISO(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Moc ngay 31 roi vao thang ngan thi lui ve ngay cuoi thang do. */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month))
}

function toUTC(iso: ISODate): number {
  const { year, month, day } = parseISO(iso)
  return Date.UTC(year, month - 1, day)
}

/** So ngay tu `from` den `to`, khong tinh ngay `to`. */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / 86_400_000)
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = new Date(toUTC(iso) + days * 86_400_000)
  return makeISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/**
 * Moc cua ky tien phong ke tiep. Luon tinh tu `cycleDay` goc chu khong tu ngay
 * cua `start`, nen moc 31 di qua thang 2 van quay lai dung 31 o thang sau.
 */
export function nextCycleStart(start: ISODate, cycleDay: number): ISODate {
  const { year, month } = parseISO(start)
  const y = month === 12 ? year + 1 : year
  const m = month === 12 ? 1 : month + 1
  return makeISO(y, m, clampDay(y, m, cycleDay))
}

/** Moc cua ky lien truoc, dung de biet ky tien phong hien tai bat dau tu dau. */
export function prevCycleStart(start: ISODate, cycleDay: number): ISODate {
  const { year, month } = parseISO(start)
  const y = month === 1 ? year - 1 : year
  const m = month === 1 ? 12 : month - 1
  return makeISO(y, m, clampDay(y, m, cycleDay))
}

/** Moc dau tien roi vao dung ngay `date` hoac sau do. */
export function cycleStartOnOrAfter(date: ISODate, cycleDay: number): ISODate {
  const { year, month } = parseISO(date)
  const candidate = makeISO(year, month, clampDay(year, month, cycleDay))
  if (candidate >= date) return candidate
  return nextCycleStart(candidate, cycleDay)
}

/** Moc cua thang chua `date`, dung lam ngay phat phieu mac dinh. */
export function cycleDateInMonthOf(date: ISODate, cycleDay: number): ISODate {
  const { year, month } = parseISO(date)
  return makeISO(year, month, clampDay(year, month, cycleDay))
}

export function periodOf(date: ISODate): Period {
  return date.slice(0, 7)
}

export function periodParts(period: Period): { year: number; month: number } {
  const [y, m] = period.split('-').map(Number)
  return { year: y, month: m }
}

export function prevPeriod(period: Period): Period {
  const { year, month } = periodParts(period)
  return month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`
}

export function nextPeriod(period: Period): Period {
  const { year, month } = periodParts(period)
  return month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`
}

export function periodBounds(period: Period): { start: ISODate; end: ISODate } {
  const { year, month } = periodParts(period)
  return {
    start: makeISO(year, month, 1),
    end: makeISO(year, month, daysInMonth(year, month)),
  }
}

/** Danh sach ky tu `from` den `to`, bao gom ca hai dau. */
export function periodRange(from: Period, to: Period): Period[] {
  const out: Period[] = []
  let cur = from
  while (cur <= to && out.length < 240) {
    out.push(cur)
    cur = nextPeriod(cur)
  }
  return out
}

export function formatDate(iso: ISODate): string {
  const { year, month, day } = parseISO(iso)
  return `${pad(day)}/${pad(month)}/${year}`
}

export function formatDateShort(iso: ISODate): string {
  const { month, day } = parseISO(iso)
  return `${pad(day)}/${pad(month)}`
}

export function formatPeriod(period: Period): string {
  const { year, month } = periodParts(period)
  return `tháng ${pad(month)}/${year}`
}

export function formatPeriodRange(period: Period): string {
  const { start, end } = periodBounds(period)
  return `${formatDateShort(start)} – ${formatDateShort(end)}`
}
