import type {
  ISODate,
  Invoice,
  InvoiceLine,
  LineType,
  PaymentStatus,
  Period,
  Reading,
  Room,
  Tenancy,
} from './types'
import * as dt from './dates'

let lineSeq = 0
function lineId(): string {
  lineSeq += 1
  return `l${Date.now().toString(36)}${lineSeq.toString(36)}`
}

function line(
  type: LineType,
  label: string,
  amount: number,
  extra: { detail?: string; qty?: number; unitPrice?: number } = {},
): InvoiceLine {
  return {
    id: lineId(),
    type,
    label,
    detail: extra.detail,
    qty: extra.qty ?? 1,
    unitPrice: extra.unitPrice ?? amount,
    amount: Math.round(amount),
  }
}

export function sumLines(lines: InvoiceLine[]): number {
  return lines.reduce((acc, l) => acc + l.amount, 0)
}

export function paidAmount(invoice: Invoice): number {
  return invoice.payments.reduce((acc, p) => acc + p.amount, 0)
}

/** Chi tinh tien thuc nhan, bo qua phan no da doi sang phieu sau. */
export function cashPaidAmount(invoice: Invoice): number {
  return invoice.payments.reduce((acc, p) => (p.method === 'carried' ? acc : acc + p.amount), 0)
}

/** Tong tien phat sinh that su cua phieu, khong tinh dong no mang tu ky truoc. */
export function ownTotal(invoice: Invoice): number {
  return invoice.lines.reduce((acc, l) => (l.type === 'carryOver' ? acc : acc + l.amount), 0)
}

export interface RevenueBreakdown {
  rent: number
  electric: number
  water: number
  garbage: number
  deposit: number
  other: number
}

/** Tong hop tien theo loai dong phiếu, bo qua no mang tu ky truoc. */
export function revenueBreakdownFromInvoices(invoices: Invoice[]): RevenueBreakdown {
  const breakdown: RevenueBreakdown = {
    rent: 0,
    electric: 0,
    water: 0,
    garbage: 0,
    deposit: 0,
    other: 0,
  }

  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      if (line.type === 'carryOver') continue
      switch (line.type) {
        case 'rent':
        case 'rentProrated':
        case 'rentRefund':
          breakdown.rent += line.amount
          break
        case 'electric':
          breakdown.electric += line.amount
          break
        case 'water':
          breakdown.water += line.amount
          break
        case 'garbage':
          breakdown.garbage += line.amount
          break
        case 'deposit':
        case 'depositRefund':
          breakdown.deposit += line.amount
          break
        default:
          breakdown.other += line.amount
          break
      }
    }
  }

  return breakdown
}

export function revenueBreakdownTotal(breakdown: RevenueBreakdown): number {
  return (
    breakdown.rent +
    breakdown.electric +
    breakdown.water +
    breakdown.garbage +
    breakdown.deposit +
    breakdown.other
  )
}

export function wasCarriedForward(invoice: Invoice): boolean {
  return invoice.payments.some((p) => p.method === 'carried')
}

/** Phan chua thanh toan. Am nghia la chu tro con phai tra lai khach. */
export function outstandingOf(invoice: Invoice): number {
  return invoice.total - paidAmount(invoice)
}

export function statusOf(invoice: Invoice): PaymentStatus {
  const remaining = outstandingOf(invoice)
  if (Math.abs(remaining) < 1) return 'paid'
  if (Math.abs(paidAmount(invoice)) >= 1) return 'partial'
  return 'unpaid'
}

export function readingsToMap(readings: Reading[]): Map<Period, Reading> {
  return new Map(readings.map((r) => [r.period, r]))
}

/**
 * Chi so dau ky. Neu luot thue bat dau ngay trong ky do thi lay chi so ban giao
 * luc nhan phong, con lai lay chi so chot cuoi ky truoc.
 */
function baselineFor(
  tenancy: Tenancy,
  readings: Map<Period, Reading>,
  period: Period,
): { electric: number; water: number } {
  const prev = readings.get(dt.prevPeriod(period))
  const tenancyStartPeriod = dt.periodOf(tenancy.startDate)
  if (!prev || tenancyStartPeriod >= period) {
    return { electric: tenancy.electricStart, water: tenancy.waterStart }
  }
  return { electric: prev.electricEnd, water: prev.waterEnd }
}

function utilityLines(
  room: Room,
  label: string,
  from: { electric: number; water: number },
  to: { electric: number; water: number },
): InvoiceLine[] {
  const lines: InvoiceLine[] = []
  if (room.electricPrice > 0) {
    const kwh = Math.max(0, to.electric - from.electric)
    lines.push(
      line('electric', `Tiền điện ${label}`, kwh * room.electricPrice, {
        detail: `${from.electric} → ${to.electric} = ${kwh} kWh`,
        qty: kwh,
        unitPrice: room.electricPrice,
      }),
    )
  }
  if (room.waterPrice > 0) {
    const m3 = Math.max(0, to.water - from.water)
    lines.push(
      line('water', `Tiền nước ${label}`, m3 * room.waterPrice, {
        detail: `${from.water} → ${to.water} = ${m3} m³`,
        qty: m3,
        unitPrice: room.waterPrice,
      }),
    )
  }
  return lines
}

/**
 * Dong dien/nuoc khi ky co thay dong hoc giua ky: tinh 2 doan
 * (baseline -> so dong cu luc thao) + (so dau dong moi -> so hien tai),
 * ghi ro ca hai doan vao chi tiet de khach xem phieu la minh bach.
 */
function utilityLinesWithReset(
  room: Room,
  label: string,
  from: { electric: number; water: number },
  to: Reading,
): InvoiceLine[] {
  const lines: InvoiceLine[] = []
  const hasElectricReset = to.electricReset !== undefined
  const hasWaterReset = to.waterReset !== undefined

  if (room.electricPrice > 0) {
    const oldKwh = hasElectricReset
      ? Math.max(0, to.electricReset! - from.electric)
      : Math.max(0, to.electricEnd - from.electric)
    const newKwh = hasElectricReset ? Math.max(0, to.electricEnd - (to.electricNewStart ?? 0)) : 0
    const kwh = oldKwh + newKwh
    const detail = hasElectricReset
      ? `${from.electric} → ${to.electricReset} (đồng hồ cũ) + ${to.electricNewStart ?? 0} → ${to.electricEnd} (đồng hồ mới) = ${kwh} kWh`
      : `${from.electric} → ${to.electricEnd} = ${kwh} kWh`
    lines.push(
      line('electric', `Tiền điện ${label}`, kwh * room.electricPrice, {
        detail,
        qty: kwh,
        unitPrice: room.electricPrice,
      }),
    )
  }

  if (room.waterPrice > 0) {
    const oldM3 = hasWaterReset
      ? Math.max(0, to.waterReset! - from.water)
      : Math.max(0, to.waterEnd - from.water)
    const newM3 = hasWaterReset ? Math.max(0, to.waterEnd - (to.waterNewStart ?? 0)) : 0
    const m3 = oldM3 + newM3
    const detail = hasWaterReset
      ? `${from.water} → ${to.waterReset} (đồng hồ cũ) + ${to.waterNewStart ?? 0} → ${to.waterEnd} (đồng hồ mới) = ${m3} m³`
      : `${from.water} → ${to.waterEnd} = ${m3} m³`
    lines.push(
      line('water', `Tiền nước ${label}`, m3 * room.waterPrice, {
        detail,
        qty: m3,
        unitPrice: room.waterPrice,
      }),
    )
  }
  return lines
}

/** Phong tro thu dien nuoc theo chi so. Nha cho thue chi thu tien nha thi de ca 3 muc = 0. */
export function roomCollectsMeteredUtilities(room: Room): boolean {
  return room.electricPrice > 0 || room.waterPrice > 0
}

export function roomCollectsGarbage(room: Room): boolean {
  return (room.garbageFee ?? 0) > 0
}

export interface MonthlyBuild {
  lines: InvoiceLine[]
  total: number
  rentFrom?: ISODate
  rentTo?: ISODate
  utilityPeriod: Period
  /** Co gia tri khi ky nay khong thu tien phong vi khach da tra truoc. */
  rentPaidThrough?: ISODate
  nextRentPaidThrough: ISODate
  warnings: string[]
}

/**
 * Phieu thang. Tien phong chay theo moc rieng cua phong, dien nuoc luon lay
 * thang lien truoc thang phat phieu.
 */
export function buildMonthlyInvoice(input: {
  room: Room
  tenancy: Tenancy
  issueDate: ISODate
  readings: Map<Period, Reading>
  carryOver: number
  forceCollectRent?: boolean
}): MonthlyBuild {
  const { room, tenancy, issueDate, readings, carryOver, forceCollectRent } = input
  const lines: InvoiceLine[] = []
  const warnings: string[] = []

  const utilityPeriod = dt.prevPeriod(dt.periodOf(issueDate))

  const rentDue = tenancy.rentPaidThrough <= issueDate
  let rentFrom: ISODate | undefined
  let rentTo: ISODate | undefined
  let nextRentPaidThrough = tenancy.rentPaidThrough

  if (rentDue || forceCollectRent) {
    rentFrom = tenancy.rentPaidThrough
    rentTo = dt.nextCycleStart(rentFrom, tenancy.cycleDay)
    nextRentPaidThrough = rentTo
    // Nhãn chốt vào phiếu lúc phát — xem/in lại không tự đổi (kiểm kê).
    lines.push(line('rent', dt.formatRentMonthLabel(rentFrom), tenancy.rent))
  }

  const utilityEnd = dt.periodBounds(utilityPeriod).end
  const tenantWasHere = tenancy.startDate <= utilityEnd

  if (roomCollectsMeteredUtilities(room)) {
    if (!tenantWasHere) {
      warnings.push(`Khách chưa ở trong ${dt.formatPeriod(utilityPeriod)} nên phiếu không có điện nước.`)
    } else {
      const reading = readings.get(utilityPeriod)
      if (!reading) {
        warnings.push(
          `Chưa nhập điện nước cho ${dt.formatInvoiceMonthLabel(dt.invoiceMonthForUtilityPeriod(utilityPeriod))} (phòng ${room.name}).`,
        )
      } else {
        const base = baselineFor(tenancy, readings, utilityPeriod)
        const label = dt.formatInvoiceMonthLabel(dt.invoiceMonthForUtilityPeriod(utilityPeriod))
        lines.push(...utilityLinesWithReset(room, label, base, reading))
        // Canh bao rieng cho tung dong: khong thay dong ho thi so moi phai >= so dau ky,
        // co thay dong ho thi so dong cu luc thao phai >= so dau ky va so moi >= so dau dong moi.
        const electricBad =
          reading.electricReset !== undefined
            ? reading.electricReset < base.electric ||
              reading.electricEnd < (reading.electricNewStart ?? 0)
            : reading.electricEnd < base.electric
        const waterBad =
          reading.waterReset !== undefined
            ? reading.waterReset < base.water ||
              reading.waterEnd < (reading.waterNewStart ?? 0)
            : reading.waterEnd < base.water
        if (electricBad) warnings.push('Số điện không hợp lệ (đồng hồ cũ/mới), kiểm tra lại.')
        if (waterBad) warnings.push('Số nước không hợp lệ (đồng hồ cũ/mới), kiểm tra lại.')
      }
    }
  }

  const garbageFee = room.garbageFee ?? 0
  if (roomCollectsGarbage(room) && tenantWasHere) {
    lines.push(line('garbage', 'Tiền rác', garbageFee))
  }

  for (const fee of room.extraFees) {
    if (fee.amount !== 0) lines.push(line('other', fee.label, fee.amount))
  }

  if (carryOver > 0) {
    lines.push(line('carryOver', 'Còn nợ kỳ trước', carryOver))
  }

  return {
    lines,
    total: sumLines(lines),
    rentFrom,
    rentTo,
    utilityPeriod,
    rentPaidThrough: rentFrom ? undefined : tenancy.rentPaidThrough,
    nextRentPaidThrough,
    warnings,
  }
}

export interface MoveInBuild {
  lines: InvoiceLine[]
  total: number
  rentFrom?: ISODate
  rentTo?: ISODate
  firstCycleStart: ISODate
  proratedDays: number
  dailyRate: number
  rentPaidThrough: ISODate
}

/**
 * Phieu nhan phong. Thu tien coc, tien le tu ngay don vao den moc ke tiep, roi
 * mot ky tron dau tien.
 */
export function buildMoveInInvoice(input: {
  rent: number
  deposit: number
  cycleDay: number
  moveInDate: ISODate
  proratedDaysOverride?: number
  collectFirstCycle: boolean
}): MoveInBuild {
  const { rent, deposit, cycleDay, moveInDate, proratedDaysOverride, collectFirstCycle } = input
  const lines: InvoiceLine[] = []

  const firstCycleStart = dt.cycleStartOnOrAfter(moveInDate, cycleDay)
  const autoDays = dt.diffDays(moveInDate, firstCycleStart)
  const proratedDays = proratedDaysOverride ?? autoDays
  const { year, month } = dt.parseISO(moveInDate)
  const dailyRate = rent / dt.daysInMonth(year, month)

  if (deposit > 0) {
    lines.push(line('deposit', 'Tiền cọc', deposit))
  }

  if (proratedDays > 0) {
    lines.push(
      line(
        'rentProrated',
        `Tiền phòng lẻ ${dt.formatDate(moveInDate)} – ${dt.formatDate(firstCycleStart)}`,
        dailyRate * proratedDays,
        {
          detail: `${proratedDays} ngày × ${Math.round(dailyRate).toLocaleString('vi-VN')} đ/ngày`,
          qty: proratedDays,
          unitPrice: Math.round(dailyRate),
        },
      ),
    )
  }

  let rentFrom: ISODate | undefined
  let rentTo: ISODate | undefined
  let rentPaidThrough = firstCycleStart

  if (collectFirstCycle) {
    rentFrom = firstCycleStart
    rentTo = dt.nextCycleStart(firstCycleStart, cycleDay)
    rentPaidThrough = rentTo
    lines.push(line('rent', dt.formatRentMonthLabel(rentFrom), rent))
  }

  return {
    lines,
    total: sumLines(lines),
    rentFrom,
    rentTo,
    firstCycleStart,
    proratedDays,
    dailyRate,
    rentPaidThrough,
  }
}

/** Phieu thu coc bo sung giua ky thue. */
export function buildDepositTopUpInvoice(input: {
  amount: number
  previousDeposit: number
  newDeposit: number
}): { lines: InvoiceLine[]; total: number } {
  const lines: InvoiceLine[] = [
    line('deposit', 'Tiền cọc bổ sung', input.amount, {
      detail: `Cọc đang giữ ${input.previousDeposit.toLocaleString('vi-VN')} → ${input.newDeposit.toLocaleString('vi-VN')} đ`,
    }),
  ]
  return { lines, total: sumLines(lines) }
}

export interface CheckoutBuild {
  lines: InvoiceLine[]
  total: number
  refundDays: number
  warnings: string[]
}

/**
 * Phieu tat toan khi tra phong. Tong am nghia la chu tro tra lai khach.
 */
export function buildCheckoutInvoice(input: {
  room: Room
  tenancy: Tenancy
  checkoutDate: ISODate
  finalElectric: number
  finalWater: number
  readings: Map<Period, Reading>
  billedUtilityPeriods: Set<Period>
  carryOver: number
  deductions: { label: string; amount: number }[]
}): CheckoutBuild {
  const {
    room,
    tenancy,
    checkoutDate,
    finalElectric,
    finalWater,
    readings,
    billedUtilityPeriods,
    carryOver,
    deductions,
  } = input

  const lines: InvoiceLine[] = []
  const warnings: string[] = []

  const checkoutPeriod = dt.periodOf(checkoutDate)
  const startPeriod = dt.periodOf(tenancy.startDate)

  if (roomCollectsMeteredUtilities(room)) {
    const pending = dt
      .periodRange(startPeriod, checkoutPeriod)
      .filter((p) => !billedUtilityPeriods.has(p))

    for (const period of pending) {
      const base = baselineFor(tenancy, readings, period)
      if (period === checkoutPeriod) {
        const { start } = dt.periodBounds(period)
        const from = tenancy.startDate > start ? tenancy.startDate : start
        const label = `${dt.formatDateShort(from)} – ${dt.formatDateShort(checkoutDate)}/${period.slice(0, 4)}`
        lines.push(
          ...utilityLines(room, label, base, { electric: finalElectric, water: finalWater }),
        )
      } else {
        const reading = readings.get(period)
        if (!reading) {
          warnings.push(`Thiếu chỉ số ${dt.formatPeriod(period)}, phần điện nước kỳ này chưa được tính.`)
          continue
        }
        const label = `${dt.formatPeriod(period)} (${dt.formatPeriodRange(period)})`
        lines.push(
          ...utilityLines(room, label, base, {
            electric: reading.electricEnd,
            water: reading.waterEnd,
          }),
        )
      }
    }
  }

  let refundDays = 0
  if (tenancy.rentPaidThrough > checkoutDate) {
    const cycleStart = dt.prevCycleStart(tenancy.rentPaidThrough, tenancy.cycleDay)
    const cycleLength = Math.max(1, dt.diffDays(cycleStart, tenancy.rentPaidThrough))
    refundDays = dt.diffDays(checkoutDate, tenancy.rentPaidThrough)
    const daily = tenancy.rent / cycleLength
    lines.push(
      line(
        'rentRefund',
        `Hoàn tiền phòng ${dt.formatDate(checkoutDate)} – ${dt.formatDate(tenancy.rentPaidThrough)}`,
        -daily * refundDays,
        {
          detail: `${refundDays} ngày × ${Math.round(daily).toLocaleString('vi-VN')} đ/ngày`,
          qty: refundDays,
          unitPrice: -Math.round(daily),
        },
      ),
    )
  }

  if (carryOver > 0) {
    lines.push(line('carryOver', 'Còn nợ các phiếu trước', carryOver))
  }

  for (const item of deductions) {
    if (item.amount !== 0) lines.push(line('other', item.label || 'Khoản trừ', item.amount))
  }

  if (tenancy.deposit > 0) {
    lines.push(line('depositRefund', 'Trừ vào tiền cọc đang giữ', -tenancy.deposit))
  }

  return { lines, total: sumLines(lines), refundDays, warnings }
}

export function invoiceCode(roomName: string, issueDate: ISODate): string {
  const compact = issueDate.replace(/-/g, '').slice(2)
  const slug = roomName.replace(/\s+/g, '').toUpperCase()
  return `${slug}-${compact}`
}
