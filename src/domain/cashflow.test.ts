import { describe, expect, it } from 'vitest'
import {
  buildLedgerEntries,
  buildLedgerWindow,
  collectByMethodInPeriod,
  rangeForPeriod,
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

    const entries = buildLedgerEntries(invoices, expenses, () => 'Nhà Trước', rangeForPeriod('2026-09'))
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
    expect(summary.otherOut).toBe(0)
    expect(summary.cashRooms).toBe(1)
    expect(summary.transferRooms).toBe(1)

    const withBal = withRunningBalance(entries)
    expect(withBal[withBal.length - 1]?.balance).toBe(3_000_000)
  })

  it('chi khac tinh dung otherOut', () => {
    const expenses: Expense[] = [
      {
        id: 'e3',
        date: '2026-09-08',
        kind: 'other',
        amount: 150_000,
        note: 'Sửa khóa',
        createdAt: '2026-09-08T00:00:00.000Z',
      },
    ]
    const entries = buildLedgerEntries([], expenses, () => 'P01', rangeForPeriod('2026-09'))
    const summary = summarizeLedger(entries)
    expect(summary.otherOut).toBe(150_000)
    expect(summary.totalOut).toBe(150_000)
    expect(entries[0]?.label).toBe('Chi khác')
  })

  it('cua so thang co so du dau ky tu thang truoc', () => {
    const invoices = [
      invoice({
        id: 'i1',
        roomId: 'r1',
        payments: [
          { id: 'p0', date: '2026-08-20', amount: 5_000_000, method: 'cash' },
          { id: 'p1', date: '2026-09-02', amount: 1_000_000, method: 'cash' },
        ],
      }),
    ]
    const expenses: Expense[] = [
      {
        id: 'e1',
        date: '2026-09-10',
        kind: 'electric',
        amount: 400_000,
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ]

    const window = buildLedgerWindow(invoices, expenses, () => 'P01', rangeForPeriod('2026-09'))
    expect(window.opening).toBe(5_000_000)
    expect(window.entries).toHaveLength(2)
    expect(window.summary.totalIn).toBe(1_000_000)
    expect(window.summary.totalOut).toBe(400_000)
    expect(window.closing).toBe(5_600_000)
  })
})
