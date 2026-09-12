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
  invoiceId?: ID
  roomId?: ID
}

export interface LedgerSummary {
  totalIn: number
  totalOut: number
  balance: number
  cashIn: number
  transferIn: number
  electricOut: number
  waterOut: number
}

/** Gom thu theo phương thức theo ngày thanh toán (không theo ngày phát phiếu). */
export function collectByMethodInPeriod(
  invoices: Invoice[],
  period: Period,
): MethodCollection {
  let cashAmount = 0
  let transferAmount = 0
  const cashRooms = new Set<ID>()
  const transferRooms = new Set<ID>()

  for (const invoice of invoices) {
    for (const payment of invoice.payments) {
      if (payment.method === 'carried') continue
      if (dt.periodOf(payment.date) !== period) continue
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
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

/**
 * Sao kê thu chi kiểu ngân hàng:
 * - Thu tiền mặt / chuyển khoản → 1 dòng Vào
 * - Chi điện / nước → 1 dòng Ra
 */
export function buildLedgerEntries(
  invoices: Invoice[],
  expenses: Expense[],
  roomNameOf: (roomId: ID) => string,
  year?: number,
): LedgerEntry[] {
  const entries: LedgerEntry[] = []

  for (const invoice of invoices) {
    const room = roomNameOf(invoice.roomId)
    for (const payment of invoice.payments) {
      if (payment.method === 'carried') continue
      if (year !== undefined && !payment.date.startsWith(String(year))) continue
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
    if (year !== undefined && !expense.date.startsWith(String(year))) continue
    entries.push({
      id: `exp:${expense.id}`,
      date: expense.date,
      direction: 'out',
      amount: Math.abs(expense.amount),
      label: expenseKindLabel(expense.kind),
      detail: expense.note,
      source: 'expense',
      expenseId: expense.id,
    })
  }

  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.id.localeCompare(b.id)
  })
  return entries
}

export function summarizeLedger(entries: LedgerEntry[]): LedgerSummary {
  let totalIn = 0
  let totalOut = 0
  let cashIn = 0
  let transferIn = 0
  let electricOut = 0
  let waterOut = 0

  for (const entry of entries) {
    if (entry.direction === 'in') {
      totalIn += entry.amount
      if (entry.label.includes('Tiền mặt')) cashIn += entry.amount
      if (entry.label.includes('Chuyển khoản')) transferIn += entry.amount
    } else {
      totalOut += entry.amount
      if (entry.label.includes('điện')) electricOut += entry.amount
      if (entry.label.includes('nước')) waterOut += entry.amount
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
  }
}

/** Số dư chạy theo từng dòng (sau khi áp dụng dòng đó). */
export function withRunningBalance(entries: LedgerEntry[]): Array<LedgerEntry & { balance: number }> {
  let balance = 0
  return entries.map((entry) => {
    balance += entry.direction === 'in' ? entry.amount : -entry.amount
    return { ...entry, balance }
  })
}
