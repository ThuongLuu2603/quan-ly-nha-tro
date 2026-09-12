import type { Expense, ExpenseKind, ID, Invoice, ISODate, Period } from './types'
import * as dt from './dates'

export interface MethodCollection {
  cashAmount: number
  transferAmount: number
  /** Số phòng có ít nhất 1 lần thu tiền mặt trong kỳ. */
  cashRooms: number
  /** Số phòng có ít nhất 1 lần thu chuyển khoản trong kỳ. */
  transferRooms: number
}

export type LedgerDirection = 'in' | 'out'

export interface LedgerEntry {
  id: string
  date: ISODate
  direction: LedgerDirection
  amount: number
  label: string
  detail?: string
  /** Liên kết phiếu (khoản thu) hoặc chi phí. */
  source: 'payment' | 'expense'
  expenseId?: ID
  expenseKind?: ExpenseKind
  invoiceId?: ID
  roomId?: ID
}

export interface LedgerSummary {
  totalIn: number
  totalOut: number
  /** Chênh lệch trong kỳ (thu − chi), chưa cộng số dư đầu. */
  balance: number
  cashIn: number
  transferIn: number
  electricOut: number
  waterOut: number
  otherOut: number
  cashRooms: number
  transferRooms: number
}

export interface DateRange {
  from: ISODate
  to: ISODate
}

export interface LedgerWindow {
  opening: number
  entries: LedgerEntry[]
  closing: number
  summary: LedgerSummary
}

function inRange(date: ISODate, range?: DateRange): boolean {
  if (!range) return true
  return date >= range.from && date <= range.to
}

/** Gom thu theo phương thức theo ngày thanh toán trong một tháng. */
export function collectByMethodInPeriod(
  invoices: Invoice[],
  period: Period,
): MethodCollection {
  const bounds = dt.periodBounds(period)
  return collectByMethodInRange(invoices, { from: bounds.start, to: bounds.end })
}

export function collectByMethodInRange(
  invoices: Invoice[],
  range: DateRange,
): MethodCollection {
  let cashAmount = 0
  let transferAmount = 0
  const cashRooms = new Set<ID>()
  const transferRooms = new Set<ID>()

  for (const invoice of invoices) {
    for (const payment of invoice.payments) {
      if (payment.method === 'carried') continue
      if (!inRange(payment.date, range)) continue
      if (payment.method === 'cash') {
        cashAmount += payment.amount
        if (payment.amount > 0) cashRooms.add(invoice.roomId)
      } else if (payment.method === 'transfer') {
        transferAmount += payment.amount
        if (payment.amount > 0) transferRooms.add(invoice.roomId)
      }
    }
  }

  return {
    cashAmount,
    transferAmount,
    cashRooms: cashRooms.size,
    transferRooms: transferRooms.size,
  }
}

export function expenseKindLabel(kind: ExpenseKind): string {
  switch (kind) {
    case 'electric':
      return 'Chi tiền điện'
    case 'water':
      return 'Chi tiền nước'
    case 'other':
      return 'Chi khác'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

/**
 * Sao kê thu chi kiểu ngân hàng (toàn bộ hoặc theo khoảng ngày):
 * - Thu tiền mặt / chuyển khoản → 1 dòng Vào
 * - Chi điện / nước → 1 dòng Ra
 */
export function buildLedgerEntries(
  invoices: Invoice[],
  expenses: Expense[],
  roomNameOf: (roomId: ID) => string,
  range?: DateRange,
): LedgerEntry[] {
  const entries: LedgerEntry[] = []

  for (const invoice of invoices) {
    const room = roomNameOf(invoice.roomId)
    for (const payment of invoice.payments) {
      if (payment.method === 'carried') continue
      if (!inRange(payment.date, range)) continue
      const methodLabel = payment.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'
      entries.push({
        id: `pay:${invoice.id}:${payment.id}`,
        date: payment.date,
        direction: payment.amount >= 0 ? 'in' : 'out',
        amount: Math.abs(payment.amount),
        label: payment.amount >= 0 ? `Thu ${methodLabel}` : `Hoàn ${methodLabel}`,
        detail: `${room} · ${invoice.code}${payment.note ? ` · ${payment.note}` : ''}`,
        source: 'payment',
        invoiceId: invoice.id,
        roomId: invoice.roomId,
      })
    }
  }

  for (const expense of expenses) {
    if (!inRange(expense.date, range)) continue
    entries.push({
      id: `exp:${expense.id}`,
      date: expense.date,
      direction: 'out',
      amount: Math.abs(expense.amount),
      label: expenseKindLabel(expense.kind),
      detail: expense.note,
      source: 'expense',
      expenseId: expense.id,
      expenseKind: expense.kind,
    })
  }

  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.id.localeCompare(b.id)
  })
  return entries
}

export function netOfEntry(entry: LedgerEntry): number {
  return entry.direction === 'in' ? entry.amount : -entry.amount
}

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  let totalIn = 0
  let totalOut = 0
  let cashIn = 0
  let transferIn = 0
  let electricOut = 0
  let waterOut = 0
  let otherOut = 0
  const cashRooms = new Set<ID>()
  const transferRooms = new Set<ID>()

  for (const entry of entries) {
    if (entry.direction === 'in') {
      totalIn += entry.amount
      if (entry.label.includes('Tiền mặt')) {
        cashIn += entry.amount
        if (entry.roomId) cashRooms.add(entry.roomId)
      }
      if (entry.label.includes('Chuyển khoản')) {
        transferIn += entry.amount
        if (entry.roomId) transferRooms.add(entry.roomId)
      }
    } else {
      totalOut += entry.amount
      switch (entry.expenseKind) {
        case 'electric':
          electricOut += entry.amount
          break
        case 'water':
          waterOut += entry.amount
          break
        case 'other':
          otherOut += entry.amount
          break
        case undefined:
          // Hoàn tiền / dòng ra không phải chi phí đã phân loại
          break
        default: {
          const _exhaustive: never = entry.expenseKind
          void _exhaustive
        }
      }
    }
  }

  return {
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
    cashIn,
    transferIn,
    electricOut,
    waterOut,
    otherOut,
    cashRooms: cashRooms.size,
    transferRooms: transferRooms.size,
  }
}

/** Cửa sổ sao kê: số dư đầu kỳ + dòng trong khoảng + số dư cuối. */
export function buildLedgerWindow(
  invoices: Invoice[],
  expenses: Expense[],
  roomNameOf: (roomId: ID) => string,
  range: DateRange,
): LedgerWindow {
  const all = buildLedgerEntries(invoices, expenses, roomNameOf)
  let opening = 0
  const entries: LedgerEntry[] = []
  for (const entry of all) {
    if (entry.date < range.from) {
      opening += netOfEntry(entry)
      continue
    }
    if (entry.date > range.to) continue
    entries.push(entry)
  }
  const summary = summarizeLedger(entries)
  return {
    opening,
    entries,
    closing: opening + summary.balance,
    summary,
  }
}

/** Số dư chạy theo từng dòng (sau khi áp dụng dòng đó). */
export function withRunningBalance(
  entries: LedgerEntry[],
  opening = 0,
): Array<LedgerEntry & { balance: number }> {
  let balance = opening
  return entries.map((entry) => {
    balance += netOfEntry(entry)
    return { ...entry, balance }
  })
}

export function rangeForPeriod(period: Period): DateRange {
  const bounds = dt.periodBounds(period)
  return { from: bounds.start, to: bounds.end }
}

export function rangeForYear(year: number): DateRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}
