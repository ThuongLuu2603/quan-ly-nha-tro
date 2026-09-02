import { describe, expect, it } from 'vitest'
import * as dt from './dates'
import {
  buildCheckoutInvoice,
  buildDepositTopUpInvoice,
  buildMonthlyInvoice,
  buildMoveInInvoice,
  cashPaidAmount,
  outstandingOf,
  ownTotal,
  paidAmount,
  readingsToMap,
  statusOf,
  wasCarriedForward,
} from './billing'
import type { Invoice, Reading, Room, Tenancy } from './types'

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

function reading(period: string, electricEnd: number, waterEnd: number): Reading {
  return { id: `r1:${period}`, roomId: 'r1', period, electricEnd, waterEnd, readAt: `${period}-28` }
}

describe('moc ngay cua ky tien phong', () => {
  it('moc 31 lui ve cuoi thang ngan roi quay lai dung moc', () => {
    expect(dt.nextCycleStart('2026-01-31', 31)).toBe('2026-02-28')
    expect(dt.nextCycleStart('2026-02-28', 31)).toBe('2026-03-31')
    expect(dt.nextCycleStart('2026-03-31', 31)).toBe('2026-04-30')
  })

  it('nam nhuan van dung', () => {
    expect(dt.nextCycleStart('2028-01-31', 31)).toBe('2028-02-29')
  })

  it('moc ke tiep tinh tu ngay don vao', () => {
    expect(dt.cycleStartOnOrAfter('2026-08-17', 1)).toBe('2026-09-01')
    expect(dt.cycleStartOnOrAfter('2026-08-17', 25)).toBe('2026-08-25')
    expect(dt.cycleStartOnOrAfter('2026-08-25', 25)).toBe('2026-08-25')
  })
})

describe('phieu thang', () => {
  it('phong moc 5: phieu 05/09 thu tien phong 05/09-05/10 va dien nuoc thang 8', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy({ cycleDay: 5, rentPaidThrough: '2026-09-05' }),
      issueDate: '2026-09-05',
      readings: readingsToMap([reading('2026-07', 100, 10), reading('2026-08', 150, 14)]),
      carryOver: 0,
    })

    expect(result.rentFrom).toBe('2026-09-05')
    expect(result.rentTo).toBe('2026-10-05')
    expect(result.utilityPeriod).toBe('2026-08')
    expect(result.total).toBe(3_000_000 + 50 * 4000 + 4 * 20000)
  })

  it('phong moc 25: phieu 25/08 thu tien phong 25/08-25/09 nhung dien nuoc la thang 7', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy({ cycleDay: 25, rentPaidThrough: '2026-08-25' }),
      issueDate: '2026-08-25',
      readings: readingsToMap([reading('2026-06', 80, 8), reading('2026-07', 100, 10)]),
      carryOver: 0,
    })

    expect(result.rentFrom).toBe('2026-08-25')
    expect(result.rentTo).toBe('2026-09-25')
    expect(result.utilityPeriod).toBe('2026-07')
    expect(result.total).toBe(3_000_000 + 20 * 4000 + 2 * 20000)
  })

  it('cong no ky truoc vao phieu', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([reading('2026-07', 100, 10), reading('2026-08', 120, 12)]),
      carryOver: 250_000,
    })
    expect(result.lines.some((l) => l.type === 'carryOver' && l.amount === 250_000)).toBe(true)
  })

  it('cong tien rac co dinh hang thang', () => {
    const result = buildMonthlyInvoice({
      room: { ...room, garbageFee: 50_000 },
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([reading('2026-07', 100, 10), reading('2026-08', 120, 12)]),
      carryOver: 0,
    })
    expect(result.lines.some((l) => l.type === 'garbage' && l.amount === 50_000)).toBe(true)
    expect(result.total).toBe(3_000_000 + 20 * 4000 + 2 * 20000 + 50_000)
  })

  it('phong chi thu tien nha khong can chi so dien nuoc', () => {
    const rentOnlyRoom: Room = { ...room, electricPrice: 0, waterPrice: 0, garbageFee: 0 }
    const result = buildMonthlyInvoice({
      room: rentOnlyRoom,
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([]),
      carryOver: 0,
    })
    expect(result.warnings).toHaveLength(0)
    expect(result.lines.some((l) => l.type === 'electric' || l.type === 'water' || l.type === 'garbage')).toBe(
      false,
    )
    expect(result.total).toBe(3_000_000)
  })

  it('canh bao khi thieu chi so', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: tenancy(),
      issueDate: '2026-09-01',
      readings: readingsToMap([]),
      carryOver: 0,
    })
    expect(result.warnings.join(' ')).toContain('Chưa nhập điện nước cho phiếu tháng')
    expect(result.lines.some((l) => l.type === 'electric')).toBe(false)
  })
})

describe('khach don vao giua thang roi ve nhip binh thuong', () => {
  const moveIn = buildMoveInInvoice({
    rent: 3_000_000,
    deposit: 2_000_000,
    cycleDay: 1,
    moveInDate: '2026-08-17',
    collectFirstCycle: true,
  })

  it('phieu nhan phong gom coc, tien le va mot ky tron', () => {
    expect(moveIn.proratedDays).toBe(15)
    expect(moveIn.firstCycleStart).toBe('2026-09-01')
    expect(moveIn.rentFrom).toBe('2026-09-01')
    expect(moveIn.rentTo).toBe('2026-10-01')
    expect(moveIn.rentPaidThrough).toBe('2026-10-01')

    const prorated = moveIn.lines.find((l) => l.type === 'rentProrated')
    expect(prorated?.amount).toBe(Math.round((3_000_000 / 31) * 15))
  })

  const afterMoveIn = tenancy({
    startDate: '2026-08-17',
    deposit: 2_000_000,
    electricStart: 500,
    waterStart: 50,
    rentPaidThrough: '2026-10-01',
  })

  it('phieu 01/09 khong thu tien phong lan hai, chi co dien nuoc thang 8', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: afterMoveIn,
      issueDate: '2026-09-01',
      readings: readingsToMap([reading('2026-08', 560, 53)]),
      carryOver: 0,
    })

    expect(result.rentFrom).toBeUndefined()
    expect(result.rentPaidThrough).toBe('2026-10-01')
    expect(result.utilityPeriod).toBe('2026-08')
    // chi so dau ky lay tu luc ban giao phong chu khong phai 0
    expect(result.total).toBe(60 * 4000 + 3 * 20000)
  })

  it('phieu 01/10 quay lai nhip tien phong thang do cong dien nuoc thang truoc', () => {
    const result = buildMonthlyInvoice({
      room,
      tenancy: afterMoveIn,
      issueDate: '2026-10-01',
      readings: readingsToMap([reading('2026-08', 560, 53), reading('2026-09', 620, 57)]),
      carryOver: 0,
    })

    expect(result.rentFrom).toBe('2026-10-01')
    expect(result.rentTo).toBe('2026-11-01')
    expect(result.utilityPeriod).toBe('2026-09')
    expect(result.total).toBe(3_000_000 + 60 * 4000 + 4 * 20000)
  })
})

describe('so sach khi don no sang phieu sau', () => {
  const invoice: Invoice = {
    id: 'i1',
    code: 'P101-260901',
    roomId: 'r1',
    tenancyId: 't1',
    kind: 'monthly',
    issueDate: '2026-09-01',
    lines: [
      { id: 'a', type: 'rent', label: 'Tiền phòng', qty: 1, unitPrice: 3_000_000, amount: 3_000_000 },
      { id: 'b', type: 'carryOver', label: 'Còn nợ kỳ trước', qty: 1, unitPrice: 300_000, amount: 300_000 },
    ],
    total: 3_300_000,
    payments: [
      { id: 'p1', date: '2026-09-02', amount: 1_000_000, method: 'cash' },
      { id: 'p2', date: '2026-10-01', amount: 2_300_000, method: 'carried', carriedTo: 'i2' },
    ],
    createdAt: '2026-09-01T00:00:00.000Z',
  }

  it('doanh thu khong dem lai phan no mang tu ky truoc', () => {
    expect(ownTotal(invoice)).toBe(3_000_000)
  })

  it('tien thuc thu khong tinh phan chi don so', () => {
    expect(cashPaidAmount(invoice)).toBe(1_000_000)
    expect(paidAmount(invoice)).toBe(3_300_000)
  })

  it('phieu da don no sang ky sau thi khong con nam trong so con phai thu', () => {
    expect(outstandingOf(invoice)).toBe(0)
    expect(statusOf(invoice)).toBe('paid')
    expect(wasCarriedForward(invoice)).toBe(true)
  })
})

describe('tra phong va tat toan coc', () => {
  it('hoan tien phong nhung ngay chua o va tru vao coc', () => {
    const result = buildCheckoutInvoice({
      room,
      tenancy: tenancy({
        cycleDay: 25,
        rentPaidThrough: '2026-09-25',
        deposit: 3_000_000,
        electricStart: 0,
        waterStart: 0,
      }),
      checkoutDate: '2026-09-10',
      finalElectric: 1000,
      finalWater: 100,
      readings: readingsToMap([reading('2026-08', 950, 96)]),
      billedUtilityPeriods: new Set(
        dt.periodRange('2026-01', '2026-08').filter((p) => p !== '2026-08'),
      ),
      carryOver: 0,
      deductions: [],
    })

    expect(result.refundDays).toBe(15)

    const refund = result.lines.find((l) => l.type === 'rentRefund')
    // ky 25/08 - 25/09 dai 31 ngay
    expect(refund?.amount).toBe(-Math.round((3_000_000 / 31) * 15))

    // dien nuoc thang 8 chua thu, cong voi phan le 01/09 - 10/09
    const electric = result.lines.filter((l) => l.type === 'electric')
    expect(electric).toHaveLength(2)
    expect(electric[0].qty).toBe(950)
    expect(electric[1].qty).toBe(50)

    expect(result.lines.some((l) => l.type === 'depositRefund' && l.amount === -3_000_000)).toBe(true)
  })

  it('tong am nghia la chu tro tra lai khach', () => {
    const result = buildCheckoutInvoice({
      room,
      tenancy: tenancy({ deposit: 3_000_000, rentPaidThrough: '2026-09-01' }),
      checkoutDate: '2026-09-01',
      finalElectric: 10,
      finalWater: 1,
      readings: readingsToMap([]),
      billedUtilityPeriods: new Set(dt.periodRange('2026-01', '2026-08')),
      carryOver: 0,
      deductions: [{ label: 'Hỏng khoá cửa', amount: 200_000 }],
    })

    expect(result.total).toBe(10 * 4000 + 1 * 20000 + 200_000 - 3_000_000)
    expect(result.total).toBeLessThan(0)
  })
})

describe('coc bo sung', () => {
  it('tao dong tien coc bo sung', () => {
    const result = buildDepositTopUpInvoice({
      amount: 2_000_000,
      previousDeposit: 0,
      newDeposit: 2_000_000,
    })
    expect(result.total).toBe(2_000_000)
    expect(result.lines[0]?.type).toBe('deposit')
  })
})
