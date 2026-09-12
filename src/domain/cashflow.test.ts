import { describe, expect, it } from 'vitest'
import {
  buildLedgerEntries,
  collectByMethodInPeriod,
  summarizeLedger,
  withRunningBalance,
} from './cashflow'
import type { Expense, Invoice } from './types'

function invoice(over: Partial<Invoice> & Pick<Invoice, 'id' | 'roomId' | 'payments'>): Invoice {
  return {
    code: 'P1',
    tenancyId: 't1',
    kind: 'monthly',
    issueDate: '2026-09-01',
    lines: [],
    total: 0,
    createdAt: '2026-09-01',
    ...over,
  }
}

describe('collectByMethodInPeriod', () => {
  it('gom tien mat / chuyen khoan theo ngay thanh toan + dem phong', () => {
    const invoices = [
      invoice({
        id: 'i1',
        roomId: 'r1',
        payments: [
          { id: 'p1', date: '2026-09-02', amount: 1_000_000, method: 'cash' },
          { id: 'p2', date: '2026-09-05', amount: 500_000, method: 'transfer' },
        ],
      }),
      invoice({
        id: 'i2',
        roomId: 'r2',
        payments: [{ id: 'p3', date: '2026-09-10', amount: 2_000_000, method: 'transfer' }],
      }),
      invoice({
        id: 'i3',
        roomId: 'r3',
        payments: [{ id: 'p4', date: '2026-08-28', amount: 900_000, method: 'cash' }],
      }),
    ]

    const sep = collectByMethodInPeriod(invoices, '2026-09')
    expect(sep.cashAmount).toBe(1_000_000)
    expect(sep.transferAmount).toBe(2_500_000)
    expect(sep.cashRooms).toBe(1)
    expect(sep.transferRooms).toBe(2)
  })

  it('bo qua carried', () => {
    const invoices = [
      invoice({
        id: 'i1',
        roomId: 'r1',
        payments: [
          { id: 'p1', date: '2026-09-01', amount: 300_000, method: 'carried', carriedTo: 'i2' },
          { id: 'p2', date: '2026-09-01', amount: 100_000, method: 'cash' },
        ],
      }),
    ]
    const sep = collectByMethodInPeriod(invoices, '2026-09')
    expect(sep.cashAmount).toBe(100_000)
    expect(sep.transferAmount).toBe(0)
  })
})

describe('ledger sao ke', () => {
  it('thu mat/chuyen = dong vao, chi dien/nuoc = dong ra, tinh so du', () => {
    const invoices = [
      invoice({
        id: 'i1',
        roomId: 'r1',
        code: 'NHA-T09',
        payments: [
          { id: 'p1', date: '2026-09-02', amount: 3_000_000, method: 'cash' },
          { id: 'p2', date: '2026-09-03', amount: 1_000_000, method: 'transfer' },
        ],
      }),
    ]
    const expenses: Expense[] = [
      {
        id: 'e1',
        date: '2026-09-04',
        kind: 'electric',
        amount: 800_000,
        createdAt: '2026-09-04T00:00:00.000Z',
      },
      {
        id: 'e2',
        date: '2026-09-05',
        kind: 'water',
        amount: 200_000,
        createdAt: '2026-09-05T00:00:00.000Z',
      },
    ]

    const entries = buildLedgerEntries(invoices, expenses, () => 'Nhà Trước', 2026)
    expect(entries).toHaveLength(4)
    expect(entries.filter((e) => e.direction === 'in')).toHaveLength(2)
    expect(entries.filter((e) => e.direction === 'out')).toHaveLength(2)

    const summary = summarizeLedger(entries)
    expect(summary.totalIn).toBe(4_000_000)
    expect(summary.totalOut).toBe(1_000_000)
    expect(summary.balance).toBe(3_000_000)
    expect(summary.cashIn).toBe(3_000_000)
    expect(summary.transferIn).toBe(1_000_000)
    expect(summary.electricOut).toBe(800_000)
    expect(summary.waterOut).toBe(200_000)

    const withBal = withRunningBalance(entries)
    expect(withBal[withBal.length - 1]?.balance).toBe(3_000_000)
  })
})
