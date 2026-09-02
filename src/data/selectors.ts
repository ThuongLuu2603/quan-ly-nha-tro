import {
  outstandingOf,
  readingsToMap,
  roomCollectsMeteredUtilities,
  statusOf,
  wasCarriedForward,
} from '../domain/billing'
import * as dt from '../domain/dates'
import type { ID, Invoice, Period, Reading, Tenancy, Tenant } from '../domain/types'
import type { Dataset } from './store'

export function activeTenancy(data: Dataset, roomId: ID): Tenancy | undefined {
  return data.tenancies.find((t) => t.roomId === roomId && t.status === 'active')
}

export function tenancyById(data: Dataset, id: ID): Tenancy | undefined {
  return data.tenancies.find((t) => t.id === id)
}

export function tenantsOf(data: Dataset, tenancyId: ID | undefined): Tenant[] {
  if (!tenancyId) return []
  return data.tenants
    .filter((t) => t.tenancyId === tenancyId)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.fullName.localeCompare(b.fullName, 'vi'))
}

export function primaryTenant(data: Dataset, tenancyId: ID | undefined): Tenant | undefined {
  const list = tenantsOf(data, tenancyId)
  return list.find((t) => t.isPrimary) ?? list[0]
}

export function readingsOfRoom(data: Dataset, roomId: ID): Reading[] {
  return data.readings.filter((r) => r.roomId === roomId).sort((a, b) => a.period.localeCompare(b.period))
}

export function readingMapOfRoom(data: Dataset, roomId: ID): Map<Period, Reading> {
  return readingsToMap(readingsOfRoom(data, roomId))
}

export function readingOf(data: Dataset, roomId: ID, period: Period): Reading | undefined {
  return data.readings.find((r) => r.roomId === roomId && r.period === period)
}

export function invoicesOfTenancy(data: Dataset, tenancyId: ID): Invoice[] {
  return data.invoices.filter((i) => i.tenancyId === tenancyId)
}

export function invoicesOfRoom(data: Dataset, roomId: ID): Invoice[] {
  return data.invoices.filter((i) => i.roomId === roomId)
}

/** Cac phieu truoc con no, dung de cong sang phieu moi roi danh dau da chuyen. */
export function outstandingInvoicesOf(
  data: Dataset,
  tenancyId: ID,
  excludeInvoiceId?: ID,
): { invoice: Invoice; remaining: number }[] {
  return invoicesOfTenancy(data, tenancyId)
    .filter((i) => i.id !== excludeInvoiceId && i.kind !== 'checkout')
    .map((invoice) => ({ invoice, remaining: outstandingOf(invoice) }))
    .filter((item) => item.remaining > 0)
}

export function carryOverOf(data: Dataset, tenancyId: ID, excludeInvoiceId?: ID): number {
  return outstandingInvoicesOf(data, tenancyId, excludeInvoiceId).reduce(
    (acc, item) => acc + item.remaining,
    0,
  )
}

export function billedUtilityPeriods(data: Dataset, tenancyId: ID): Set<Period> {
  const set = new Set<Period>()
  for (const inv of invoicesOfTenancy(data, tenancyId)) {
    if (inv.utilityPeriod) set.add(inv.utilityPeriod)
    for (const l of inv.lines) {
      if (l.type === 'electric' || l.type === 'water') {
        const match = /(\d{2})\/(\d{4})/.exec(l.label)
        if (match) set.add(`${match[2]}-${match[1]}`)
      }
    }
  }
  return set
}

export interface RoomOverview {
  roomId: ID
  tenancy?: Tenancy
  primaryName: string
  occupantCount: number
  nextIssueDate?: string
  hasReadingForNextInvoice: boolean
  unpaidTotal: number
  lastInvoice?: Invoice
}

export function roomOverview(data: Dataset, roomId: ID, todayISO: string): RoomOverview {
  const room = data.rooms.find((r) => r.id === roomId)
  const tenancy = activeTenancy(data, roomId)
  const tenants = tenantsOf(data, tenancy?.id)
  const primary = tenants.find((t) => t.isPrimary) ?? tenants[0]
  const invoices = tenancy ? invoicesOfTenancy(data, tenancy.id) : []
  const unpaidTotal = invoices.reduce((acc, inv) => {
    const remaining = outstandingOf(inv)
    return remaining > 0 ? acc + remaining : acc
  }, 0)

  let nextIssueDate: string | undefined
  let hasReadingForNextInvoice = false
  if (tenancy) {
    nextIssueDate = nextIssueDateFor(data, tenancy, todayISO)
    if (room && roomCollectsMeteredUtilities(room)) {
      const period = dt.prevPeriod(dt.periodOf(nextIssueDate))
      hasReadingForNextInvoice = Boolean(readingOf(data, roomId, period))
    } else {
      hasReadingForNextInvoice = true
    }
  }

  return {
    roomId,
    tenancy,
    primaryName: primary?.fullName ?? '',
    occupantCount: tenants.length,
    nextIssueDate,
    hasReadingForNextInvoice,
    unpaidTotal,
    lastInvoice: invoices.sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0],
  }
}

/**
 * Moc phat phieu ke tiep chua co phieu thang tuong ung. Duyet tu moc cua thang
 * truoc de bat cac phong bi bo lo.
 */
export function nextIssueDateFor(data: Dataset, tenancy: Tenancy, todayISO: string): string {
  const issued = new Set(
    invoicesOfTenancy(data, tenancy.id)
      .filter((i) => i.kind === 'monthly')
      .map((i) => i.issueDate),
  )
  const moveInDates = new Set(
    invoicesOfTenancy(data, tenancy.id)
      .filter((i) => i.kind === 'moveIn')
      .map((i) => i.issueDate),
  )
  let candidate = dt.cycleDateInMonthOf(dt.addDays(todayISO, -45), tenancy.cycleDay)
  for (let i = 0; i < 24; i++) {
    if (
      !issued.has(candidate) &&
      !moveInDates.has(candidate) &&
      candidate >= tenancy.startDate
    ) {
      return candidate
    }
    candidate = dt.nextCycleStart(candidate, tenancy.cycleDay)
  }
  return dt.cycleDateInMonthOf(todayISO, tenancy.cycleDay)
}

/** Phieu thang da gom no tu phieu nay (neu co). */
export function invoiceAbsorbedBy(data: Dataset, invoice: Invoice): Invoice | undefined {
  const carried = invoice.payments.find((p) => p.method === 'carried' && p.carriedTo)
  if (!carried?.carriedTo) return undefined
  return data.invoices.find((i) => i.id === carried.carriedTo)
}

export function invoiceStatusLabel(invoice: Invoice, absorbedByCode?: string): string {
  const status = statusOf(invoice)
  if (status === 'paid') {
    if (wasCarriedForward(invoice)) {
      return absorbedByCode ? `Đã gộp vào ${absorbedByCode}` : 'Đã gộp vào phiếu sau'
    }
    return invoice.total < 0 ? 'Đã trả khách' : 'Đã thu'
  }
  if (status === 'partial') return 'Thu một phần'
  return invoice.total < 0 ? 'Chưa trả khách' : 'Chưa thu'
}

export function totalDepositHeld(data: Dataset): number {
  return data.tenancies
    .filter((t) => t.status === 'active')
    .reduce((acc, t) => acc + t.deposit, 0)
}
