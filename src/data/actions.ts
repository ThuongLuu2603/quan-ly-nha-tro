import {
  buildCheckoutInvoice,
  buildDepositTopUpInvoice,
  buildMonthlyInvoice,
  buildMoveInInvoice,
  invoiceCode,
  sumLines,
} from '../domain/billing'
import * as dt from '../domain/dates'
import type {
  ID,
  ISODate,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentMethod,
  Period,
  Room,
  Settings,
  Tenancy,
  Tenant,
} from '../domain/types'
import { db, newId } from './db'
import { initSupabaseFromDb } from '../sync/supabase'
import {
  billedUtilityPeriods,
  carryOverOf,
  outstandingInvoicesOf,
  readingMapOfRoom,
  tenantsOf,
} from './selectors'
import type { Dataset } from './store'

/**
 * Khi mot phieu moi da gom no cu vao dong "Con no ky truoc", danh dau cac phieu
 * nguon la da chuyen di. Neu khong lam vay thi khoan no bi dem hai lan o muc
 * tong con phai thu.
 */
async function markCarriedForward(
  sources: { invoiceId: ID; remaining: number }[],
  targetInvoiceId: ID,
  targetCode: string,
): Promise<void> {
  for (const source of sources) {
    const invoice = await db.invoices.get(source.invoiceId)
    if (!invoice) continue
    await db.invoices.put({
      ...invoice,
      payments: [
        ...invoice.payments,
        {
          id: newId(),
          date: dt.today(),
          amount: source.remaining,
          method: 'carried',
          note: `Dồn sang phiếu ${targetCode}`,
          carriedTo: targetInvoiceId,
        },
      ],
    })
  }
}

async function undoCarriedForward(targetInvoiceId: ID): Promise<void> {
  const affected = await db.invoices.filter((invoice) =>
    invoice.payments.some((p) => p.carriedTo === targetInvoiceId),
  ).toArray()
  for (const invoice of affected) {
    await db.invoices.put({
      ...invoice,
      payments: invoice.payments.filter((p) => p.carriedTo !== targetInvoiceId),
    })
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await db.settings.get('app')
  if (!current) return
  await db.settings.put({ ...current, ...patch, id: 'app' })
  if ('supabaseUrl' in patch || 'supabaseAnonKey' in patch) {
    await initSupabaseFromDb()
  }
}

export async function saveRoom(room: Room): Promise<void> {
  await db.rooms.put(room)
}

export async function reorderRooms(orderedIds: ID[]): Promise<void> {
  await db.transaction('rw', db.rooms, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const room = await db.rooms.get(orderedIds[i])
      if (room) await db.rooms.put({ ...room, order: i + 1 })
    }
  })
}

export async function createRoom(input: Omit<Room, 'id' | 'order'> & { order?: number }): Promise<ID> {
  const count = await db.rooms.count()
  const room: Room = { ...input, id: newId(), order: input.order ?? count + 1 }
  await db.rooms.put(room)
  return room.id
}

export async function deleteRoom(roomId: ID): Promise<void> {
  const tenancies = await db.tenancies.where('roomId').equals(roomId).toArray()
  const tenancyIds = tenancies.map((t) => t.id)
  await db.transaction('rw', db.rooms, db.tenancies, db.tenants, db.readings, db.invoices, async () => {
    await db.invoices.where('roomId').equals(roomId).delete()
    await db.readings.where('roomId').equals(roomId).delete()
    for (const id of tenancyIds) await db.tenants.where('tenancyId').equals(id).delete()
    await db.tenancies.where('roomId').equals(roomId).delete()
    await db.rooms.delete(roomId)
  })
}

export async function saveReading(input: {
  roomId: ID
  period: Period
  electricEnd: number
  waterEnd: number
  readAt?: ISODate
}): Promise<void> {
  await db.readings.put({
    id: `${input.roomId}:${input.period}`,
    roomId: input.roomId,
    period: input.period,
    electricEnd: input.electricEnd,
    waterEnd: input.waterEnd,
    readAt: input.readAt ?? dt.today(),
  })
}

export async function deleteReading(roomId: ID, period: Period): Promise<void> {
  await db.readings.delete(`${roomId}:${period}`)
}

export interface MoveInInput {
  roomId: ID
  roomName: string
  startDate: ISODate
  cycleDay: number
  rent: number
  deposit: number
  electricStart: number
  waterStart: number
  collectFirstCycle: boolean
  proratedDaysOverride?: number
  tenants: { fullName: string; phone?: string; idNumber?: string; isPrimary: boolean }[]
  note?: string
}

export async function moveIn(input: MoveInInput): Promise<ID> {
  const build = buildMoveInInvoice({
    rent: input.rent,
    deposit: input.deposit,
    cycleDay: input.cycleDay,
    moveInDate: input.startDate,
    collectFirstCycle: input.collectFirstCycle,
    proratedDaysOverride: input.proratedDaysOverride,
  })

  const tenancy: Tenancy = {
    id: newId(),
    roomId: input.roomId,
    startDate: input.startDate,
    rent: input.rent,
    deposit: input.deposit,
    cycleDay: input.cycleDay,
    electricStart: input.electricStart,
    waterStart: input.waterStart,
    rentPaidThrough: build.rentPaidThrough,
    status: 'active',
    note: input.note,
  }

  const tenantRows: Tenant[] = input.tenants
    .filter((t) => t.fullName.trim())
    .map((t, index) => ({
      id: newId(),
      tenancyId: tenancy.id,
      fullName: t.fullName.trim(),
      phone: t.phone?.trim() || undefined,
      idNumber: t.idNumber?.trim() || undefined,
      isPrimary: t.isPrimary || index === 0,
    }))

  const invoice: Invoice = {
    id: newId(),
    code: invoiceCode(input.roomName, input.startDate),
    roomId: input.roomId,
    tenancyId: tenancy.id,
    kind: 'moveIn',
    issueDate: input.startDate,
    rentFrom: build.rentFrom,
    rentTo: build.rentTo,
    lines: build.lines,
    total: build.total,
    payments: [],
    createdAt: new Date().toISOString(),
  }

  await db.transaction('rw', db.tenancies, db.tenants, db.invoices, async () => {
    await db.tenancies.put(tenancy)
    await db.tenants.bulkPut(tenantRows)
    await db.invoices.put(invoice)
  })

  return invoice.id
}

export async function saveTenant(tenant: Tenant): Promise<void> {
  await db.tenants.put(tenant)
}

export async function addTenant(tenancyId: ID, fullName: string): Promise<void> {
  const existing = await db.tenants.where('tenancyId').equals(tenancyId).count()
  await db.tenants.put({
    id: newId(),
    tenancyId,
    fullName,
    isPrimary: existing === 0,
  })
}

export async function deleteTenant(tenantId: ID): Promise<void> {
  await db.tenants.delete(tenantId)
}

export async function updateTenancy(tenancyId: ID, patch: Partial<Tenancy>): Promise<void> {
  const current = await db.tenancies.get(tenancyId)
  if (!current) return
  await db.tenancies.put({ ...current, ...patch })
}

export interface AdjustTenancyInput {
  room: Room
  tenancy: Tenancy
  rent: number
  deposit: number
  /** Mac dinh true khi coc tang — tao phieu thu coc bo sung. */
  issueDepositInvoice?: boolean
  note?: string
}

/**
 * Cap nhat gia thue / coc dang giu cho luot thue hien tai.
 * Gia moi ap dung tu ky chua thu (rentPaidThrough). Coc tang co the tao phieu thu.
 */
export async function adjustTenancy(input: AdjustTenancyInput): Promise<ID | null> {
  const { room, tenancy, rent, deposit, note } = input
  const depositIncrease = Math.max(0, deposit - tenancy.deposit)
  const issueDepositInvoice = input.issueDepositInvoice !== false && depositIncrease > 0
  let invoiceId: ID | null = null

  await db.transaction('rw', db.tenancies, db.invoices, async () => {
    await db.tenancies.put({
      ...tenancy,
      rent: Math.round(rent),
      deposit: Math.round(deposit),
      note: note?.trim() || tenancy.note,
    })

    if (issueDepositInvoice) {
      const issueDate = dt.today()
      const build = buildDepositTopUpInvoice({
        amount: depositIncrease,
        previousDeposit: tenancy.deposit,
        newDeposit: deposit,
      })
      const invoice: Invoice = {
        id: newId(),
        code: invoiceCode(room.name, issueDate),
        roomId: room.id,
        tenancyId: tenancy.id,
        kind: 'adjustment',
        issueDate,
        lines: build.lines,
        total: build.total,
        payments: [],
        note: note?.trim() || undefined,
        createdAt: new Date().toISOString(),
      }
      await db.invoices.put(invoice)
      invoiceId = invoice.id
    }
  })

  return invoiceId
}

export interface IssueMonthlyInput {
  data: Dataset
  room: Room
  tenancy: Tenancy
  issueDate: ISODate
  forceCollectRent?: boolean
}

export function previewMonthly(input: IssueMonthlyInput) {
  const { data, room, tenancy, issueDate, forceCollectRent } = input
  return buildMonthlyInvoice({
    room,
    tenancy,
    issueDate,
    readings: readingMapOfRoom(data, room.id),
    carryOver: carryOverOf(data, tenancy.id),
    forceCollectRent,
  })
}

export async function issueMonthlyInvoice(input: IssueMonthlyInput): Promise<ID> {
  const build = previewMonthly(input)
  const sources = outstandingInvoicesOf(input.data, input.tenancy.id).map((item) => ({
    invoiceId: item.invoice.id,
    remaining: item.remaining,
  }))
  const invoice: Invoice = {
    id: newId(),
    code: invoiceCode(input.room.name, input.issueDate),
    roomId: input.room.id,
    tenancyId: input.tenancy.id,
    kind: 'monthly',
    issueDate: input.issueDate,
    rentFrom: build.rentFrom,
    rentTo: build.rentTo,
    utilityPeriod: build.utilityPeriod,
    lines: build.lines,
    total: build.total,
    payments: [],
    createdAt: new Date().toISOString(),
  }

  await db.transaction('rw', db.invoices, db.tenancies, async () => {
    await db.invoices.put(invoice)
    if (build.rentTo) {
      await db.tenancies.update(input.tenancy.id, { rentPaidThrough: build.rentTo })
    }
    await markCarriedForward(sources, invoice.id, invoice.code)
  })

  return invoice.id
}

export interface CheckoutInput {
  data: Dataset
  room: Room
  tenancy: Tenancy
  checkoutDate: ISODate
  finalElectric: number
  finalWater: number
  deductions: { label: string; amount: number }[]
}

export function previewCheckout(input: CheckoutInput) {
  const { data, room, tenancy, checkoutDate, finalElectric, finalWater, deductions } = input
  return buildCheckoutInvoice({
    room,
    tenancy,
    checkoutDate,
    finalElectric,
    finalWater,
    readings: readingMapOfRoom(data, room.id),
    billedUtilityPeriods: billedUtilityPeriods(data, tenancy.id),
    carryOver: carryOverOf(data, tenancy.id),
    deductions,
  })
}

export async function checkout(input: CheckoutInput): Promise<ID> {
  const build = previewCheckout(input)
  const sources = outstandingInvoicesOf(input.data, input.tenancy.id).map((item) => ({
    invoiceId: item.invoice.id,
    remaining: item.remaining,
  }))
  const invoice: Invoice = {
    id: newId(),
    code: invoiceCode(input.room.name, input.checkoutDate),
    roomId: input.room.id,
    tenancyId: input.tenancy.id,
    kind: 'checkout',
    issueDate: input.checkoutDate,
    lines: build.lines,
    total: build.total,
    payments: [],
    createdAt: new Date().toISOString(),
  }

  await db.transaction('rw', db.invoices, db.tenancies, db.readings, async () => {
    await db.invoices.put(invoice)
    await markCarriedForward(sources, invoice.id, invoice.code)
    await db.tenancies.update(input.tenancy.id, {
      status: 'closed',
      endDate: input.checkoutDate,
    })
    // chi so chot luc tra phong tro thanh so dau cho khach ke tiep
    const period = dt.periodOf(input.checkoutDate)
    await db.readings.put({
      id: `${input.room.id}:${period}`,
      roomId: input.room.id,
      period,
      electricEnd: input.finalElectric,
      waterEnd: input.finalWater,
      readAt: input.checkoutDate,
    })
  })

  return invoice.id
}

export async function addPayment(
  invoiceId: ID,
  payment: { amount: number; method: PaymentMethod; date?: ISODate; note?: string },
): Promise<void> {
  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) return
  const row: Payment = {
    id: newId(),
    date: payment.date ?? dt.today(),
    amount: Math.round(payment.amount),
    method: payment.method,
    note: payment.note,
  }
  await db.invoices.put({ ...invoice, payments: [...invoice.payments, row] })
}

export async function removePayment(invoiceId: ID, paymentId: ID): Promise<void> {
  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) return
  await db.invoices.put({
    ...invoice,
    payments: invoice.payments.filter((p) => p.id !== paymentId),
  })
}

export async function markInvoiceSent(invoiceId: ID): Promise<void> {
  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) return
  await db.invoices.put({ ...invoice, sentAt: new Date().toISOString() })
}

export async function updateInvoiceLines(invoiceId: ID, lines: InvoiceLine[]): Promise<void> {
  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) return
  await db.invoices.put({ ...invoice, lines, total: sumLines(lines) })
}

/**
 * Xoa phieu, tra lai moc da tra tien phong va tra lai khoan no ve phieu goc.
 */
export async function deleteInvoice(invoiceId: ID): Promise<void> {
  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) return
  await db.transaction('rw', db.invoices, db.tenancies, async () => {
    const tenancy = await db.tenancies.get(invoice.tenancyId)
    if (tenancy && invoice.rentFrom && tenancy.rentPaidThrough === invoice.rentTo) {
      await db.tenancies.update(tenancy.id, { rentPaidThrough: invoice.rentFrom })
    }
    if (invoice.kind === 'checkout' && tenancy) {
      await db.tenancies.update(tenancy.id, { status: 'active', endDate: undefined })
    }
    if (invoice.kind === 'adjustment' && tenancy) {
      const depositLine = invoice.lines.find((l) => l.type === 'deposit' && l.amount > 0)
      if (depositLine) {
        await db.tenancies.update(tenancy.id, {
          deposit: Math.max(0, tenancy.deposit - depositLine.amount),
        })
      }
    }
    await undoCarriedForward(invoiceId)
    await db.invoices.delete(invoiceId)
  })
}

export function occupantNames(data: Dataset, tenancyId: ID | undefined): string {
  return tenantsOf(data, tenancyId)
    .map((t) => t.fullName)
    .join(', ')
}
