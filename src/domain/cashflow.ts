import type { Expense, ExpenseKind, ID, Invoice, ISODate, Period } from './types'
import * as dt from './dates'

export interface MethodCollection {
  cashAmount: number
  transferAmount: number
  /** Số phòng có ít nhất 1 lần thu tiền mặt trong kỳ thu. */
  cashRooms: number
  /** Số phòng có ít nhất 1 lần thu chuyển khoản trong kỳ thu. */
  transferRooms: number
}

export type LedgerDirection = 'in' | 'out'

export interface LedgerEntry {
  id: string
  date: ISODate
  /** Tháng/kỳ thu để quyết toán (tháng phát phiếu hoặc tháng chi). */
  settlementPeriod: Period
  direction: LedgerDirection
  amount: number
  label: string
  detail?: string
  source: 'payment' | 'expense'
  /** Dòng Ra cặp với thu tiền mặt (rút khỏi quỹ). */
  isCashWithdraw?: boolean
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
  /** Rút tiền mặt khỏi quỹ (cặp 1-1 với thu tiền mặt). */
  cashOut: number
  transferIn: number
  electricOut: number
  waterOut: number
  otherOut: number
  /** Chi vận hành (điện + nước + khác), không gồm rút tiền mặt. */
  operatingOut: number
  cashRooms: number
  transferRooms: number
}

export interface LedgerWindow {
  opening: number
  entries: LedgerEntry[]
  closing: number
  summary: LedgerSummary
}

/** Kỳ thu của phiếu = tháng phát phiếu. */
export function settlementPeriodOfInvoice(invoice: Invoice): Period {
  return dt.periodOf(invoice.issueDate)
}

export function settlementPeriodOfExpense(expense: Expense): Period {
  return dt.periodOf(expense.date)
}

/**
 * Gom thu theo phương thức theo kỳ thu (tháng phát phiếu),
 * không theo ngày khách chuyển tiền.
 */
export function collectByMethodInPeriod(
  invoices: Invoice[],
  period: Period,
): MethodCollection {
  let cashAmount = 0
  let transferAmount = 0
  const cashRooms = new Set<ID>()
  const transferRooms = new Set<ID>()

  for (const invoice of invoices) {
    if (settlementPeriodOfInvoice(invoice) !== period) continue
    for (const payment of invoice.payments) {
      if (payment.method === 'carried') continue
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
 * Toàn bộ dòng sao kê, gắn settlementPeriod:
 * - Thu: theo tháng phát phiếu (kỳ thu)
 * - Thu tiền mặt: thêm 1 dòng Ra cùng số tiền (rút khỏi quỹ)
 * - Chi điện/nước/khác: theo tháng ghi chi
 */
export function buildAllLedgerEntries(
  invoices: Invoice[],
  expenses: Expense[],
  roomNameOf: (roomId: ID) => string,
): LedgerEntry[] {
  const entries: LedgerEntry[] = []

  for (const invoice of invoices) {
    const room = roomNameOf(invoice.roomId)
    const settlementPeriod = settlementPeriodOfInvoice(invoice)
    for (const payment of invoice.payments) {
      if (payment.method === 'carried') continue
      const isCash = payment.method === 'cash'
      const methodLabel = isCash ? 'Tiền mặt' : 'Chuyển khoản'
      const amount = Math.abs(payment.amount)
      const detail = `${room} · ${invoice.code}${payment.note ? ` · ${payment.note}` : ''}`

      if (payment.amount >= 0) {
        entries.push({
          id: `pay:${invoice.id}:${payment.id}`,
          date: payment.date,
          settlementPeriod,
          direction: 'in',
          amount,
          label: `Thu ${methodLabel}`,
          detail,
          source: 'payment',
          invoiceId: invoice.id,
          roomId: invoice.roomId,
        })
        // Tiền mặt vào quỹ rồi rút ra ngay — ghi rõ 1 dòng Ra tương ứng.
        if (isCash && amount > 0) {
          entries.push({
            id: `pay:${invoice.id}:${payment.id}:cash-out`,
            date: payment.date,
            settlementPeriod,
            direction: 'out',
            amount,
            label: 'Chi tiền mặt',
            detail: `Rút quỹ · ${detail}`,
            source: 'payment',
            isCashWithdraw: true,
            invoiceId: invoice.id,
            roomId: invoice.roomId,
          })
        }
      } else {
        entries.push({
          id: `pay:${invoice.id}:${payment.id}`,
          date: payment.date,
          settlementPeriod,
          direction: 'out',
          amount,
          label: `Hoàn ${methodLabel}`,
          detail,
          source: 'payment',
          invoiceId: invoice.id,
          roomId: invoice.roomId,
        })
      }
    }
  }

  for (const expense of expenses) {
    entries.push({
      id: `exp:${expense.id}`,
      date: expense.date,
      settlementPeriod: settlementPeriodOfExpense(expense),
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
    if (a.settlementPeriod !== b.settlementPeriod) {
      return a.settlementPeriod.localeCompare(b.settlementPeriod)
    }
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    // Cặp thu tiền mặt + chi tiền mặt đứng liền nhau.
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
  let cashOut = 0
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
      if (entry.isCashWithdraw) {
        cashOut += entry.amount
        continue
      }
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
          break
        default: {
          const _exhaustive: never = entry.expenseKind
          void _exhaustive
        }
      }
    }
  }

  const operatingOut = electricOut + waterOut + otherOut
  return {
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
    cashIn,
    cashOut,
    transferIn,
    electricOut,
    waterOut,
    otherOut,
    operatingOut,
    cashRooms: cashRooms.size,
    transferRooms: transferRooms.size,
  }
}

function matchesSettlement(
  entry: LedgerEntry,
  filter: { period?: Period; year?: number },
): boolean {
  if (filter.period) return entry.settlementPeriod === filter.period
  if (filter.year !== undefined) return entry.settlementPeriod.startsWith(String(filter.year))
  return true
}

/**
 * Quyết toán theo tháng/kỳ thu (hoặc cả năm):
 * số dư đầu = tổng các kỳ thu trước đó.
 */
export function buildSettlementWindow(
  invoices: Invoice[],
  expenses: Expense[],
  roomNameOf: (roomId: ID) => string,
  filter: { period: Period } | { year: number },
): LedgerWindow {
  const all = buildAllLedgerEntries(invoices, expenses, roomNameOf)
  let opening = 0
  const entries: LedgerEntry[] = []

  const period = 'period' in filter ? filter.period : undefined
  const year = 'year' in filter ? filter.year : undefined

  for (const entry of all) {
    if (period) {
      if (entry.settlementPeriod < period) {
        opening += netOfEntry(entry)
        continue
      }
      if (entry.settlementPeriod === period) entries.push(entry)
      continue
    }

    // Cả năm: số dư đầu = trước ngày 01/01 năm đó
    if (year !== undefined) {
      const yearStart = `${year}-01`
      if (entry.settlementPeriod < yearStart) {
        opening += netOfEntry(entry)
        continue
      }
      if (entry.settlementPeriod.startsWith(String(year))) entries.push(entry)
    }
  }

  const summary = summarizeLedger(entries)
  return {
    opening,
    entries,
    closing: opening + summary.balance,
    summary,
  }
}

/** @deprecated dùng buildSettlementWindow — giữ alias để tương thích tạm. */
export function buildLedgerWindow(
  invoices: Invoice[],
  expenses: Expense[],
  roomNameOf: (roomId: ID) => string,
  range: { from: ISODate; to: ISODate },
): LedgerWindow {
  const period = dt.periodOf(range.from)
  return buildSettlementWindow(invoices, expenses, roomNameOf, { period })
}

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

/** @deprecated */
export function buildLedgerEntries(
  invoices: Invoice[],
  expenses: Expense[],
  roomNameOf: (roomId: ID) => string,
  range?: { from: ISODate; to: ISODate },
): LedgerEntry[] {
  const all = buildAllLedgerEntries(invoices, expenses, roomNameOf)
  if (!range) return all
  const period = dt.periodOf(range.from)
  return all.filter((e) => matchesSettlement(e, { period }))
}

export function rangeForPeriod(period: Period): { from: ISODate; to: ISODate } {
  const bounds = dt.periodBounds(period)
  return { from: bounds.start, to: bounds.end }
}

export function rangeForYear(year: number): { from: ISODate; to: ISODate } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}
