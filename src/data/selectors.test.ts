import { describe, expect, it } from 'vitest'
import { nextIssueDateFor } from './selectors'
import type { Dataset } from './store'
import { DEFAULT_SETTINGS } from './db'
import type { Invoice, Tenancy } from '../domain/types'

const tenancy: Tenancy = {
  id: 't1',
  roomId: 'r1',
  startDate: '2026-08-01',
  rent: 1_400_000,
  deposit: 0,
  cycleDay: 1,
  electricStart: 0,
  waterStart: 0,
  rentPaidThrough: '2026-09-01',
  status: 'active',
}

const moveInInvoice: Invoice = {
  id: 'i-movein',
  code: 'P01-260801',
  roomId: 'r1',
  tenancyId: 't1',
  kind: 'moveIn',
  issueDate: '2026-08-01',
  lines: [],
  total: 1_400_000,
  payments: [],
  createdAt: '2026-08-01T00:00:00.000Z',
}

function dataset(invoices: Invoice[]): Dataset {
  return {
    rooms: [],
    tenancies: [tenancy],
    tenants: [],
    readings: [],
    invoices,
    settings: DEFAULT_SETTINGS,
    ready: true,
  }
}

describe('nextIssueDateFor', () => {
  it('khong de phat phieu thang trung ngay nhan phong', () => {
    expect(nextIssueDateFor(dataset([moveInInvoice]), tenancy, '2026-09-02')).toBe('2026-09-01')
  })
})
