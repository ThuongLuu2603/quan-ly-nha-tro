import { describe, expect, it } from 'vitest'
import { buildMonthlyInvoice, readingsToMap } from './billing'
import type { Reading, Room, Tenancy } from './types'

const room: Room = {
  id: 'r1',
  name: 'P101',
  order: 1,
  electricPrice: 4000,
  waterPrice: 20000,
  garbageFee: 0,
  extraFees: [],
  defaultRent: 3_000_000,
  defaultDeposit: 3_000_000,
  defaultCycleDay: 1,
}

function tenancy(over: Partial<Tenancy> = {}): Tenancy {
  return {
    id: 't1',
    roomId: 'r1',
    startDate: '2026-01-01',
    rent: 3_000_000,
    deposit: 3_000_000,
    cycleDay: 1,
    electricStart: 0,
    waterStart: 0,
    rentPaidThrough: '2026-09-01',
    status: 'active',
    ...over,
  }
}

function reading(period: string, electricEnd: number, waterEnd: number, resets: Partial<Reading> = {}): Reading {
  return { id: `r1:${period}`, roomId: 'r1', period, electricEnd, waterEnd, readAt: `${period}-28`, ...resets }
}

describe('thay dong ho giua ky', () => {
  it('dong dien: cu thao tai 118 (tu 100), moi chay 0 -> 42 = 60 kWh', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([
        reading('2026-07', 100, 10),
        reading('2026-08', 42, 20, { electricReset: 118, electricNewStart: 0 }),
      ]),
      carryOver: 0,
    })

    const electric = result.lines.find((l) => l.type === 'electric')
    expect(electric?.qty).toBe(18 + 42) // (118-100) + (42-0)
    expect(electric?.amount).toBe(60 * 4000)
    expect(electric?.detail).toContain('118')
    expect(electric?.detail).toContain('đồng hồ cũ')
    expect(electric?.detail).toContain('đồng hồ mới')

    const water = result.lines.find((l) => l.type === 'water')
    expect(water?.qty).toBe(10) // khong thay dong ho nuoc: 20 - 10 (baseline T07)
  })

  it('dong nuoc: cu thao tai 19 (tu 14), moi chay 2 -> 8 = 13 m3', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([
        reading('2026-07', 100, 10),
        reading('2026-08', 120, 8, { waterReset: 19, waterNewStart: 2 }),
      ]),
      carryOver: 0,
    })

    const water = result.lines.find((l) => l.type === 'water')
    expect(water?.qty).toBe(9 + 6) // (19-10) + (8-2)
    expect(water?.amount).toBe(15 * 20000)

    const electric = result.lines.find((l) => l.type === 'electric')
    expect(electric?.qty).toBe(20) // khong thay: 120 - 100
  })

  it('thay ca hai dong: dien 2 doan, nuoc 2 doan', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([
        reading('2026-07', 100, 10),
        reading('2026-08', 30, 5, {
          electricReset: 150,
          electricNewStart: 0,
          waterReset: 18,
          waterNewStart: 0,
        }),
      ]),
      carryOver: 0,
    })

    const electric = result.lines.find((l) => l.type === 'electric')
    expect(electric?.qty).toBe(50 + 30)
    const water = result.lines.find((l) => l.type === 'water')
    expect(water?.qty).toBe(8 + 5)
  })

  it('canh bao khi so dong cu thao nho hon dau ky', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([
        reading('2026-07', 100, 10),
        reading('2026-08', 42, 20, { electricReset: 80, electricNewStart: 0 }),
      ]),
      carryOver: 0,
    })

    expect(result.warnings.join(' ')).toContain('điện')
  })

  it('khong canh bao khi thay dong ho hop le', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([
        reading('2026-07', 100, 10),
        reading('2026-08', 42, 20, { electricReset: 118, electricNewStart: 0 }),
      ]),
      carryOver: 0,
    })

    expect(result.warnings.join(' ')).not.toContain('điện')
  })
})
