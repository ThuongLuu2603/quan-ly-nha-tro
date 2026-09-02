import Dexie, { type Table } from 'dexie'
import type { Invoice, Reading, Room, Settings, Tenancy, Tenant } from '../domain/types'
import type { SyncOutboxRow } from '../sync/types'

export class TroDatabase extends Dexie {
  rooms!: Table<Room, string>
  tenancies!: Table<Tenancy, string>
  tenants!: Table<Tenant, string>
  readings!: Table<Reading, string>
  invoices!: Table<Invoice, string>
  settings!: Table<Settings, string>
  syncOutbox!: Table<SyncOutboxRow, string>
  syncMeta!: Table<{ key: string; value: string }, string>

  constructor() {
    super('quanlytro')
    this.version(1).stores({
      rooms: 'id, order, name',
      tenancies: 'id, roomId, status, startDate',
      tenants: 'id, tenancyId',
      readings: 'id, roomId, period, [roomId+period]',
      invoices: 'id, roomId, tenancyId, issueDate, utilityPeriod, kind',
      settings: 'id',
    })
    this.version(2).stores({
      syncOutbox: 'entityKey, entityType, updatedAt',
      syncMeta: 'key',
    })
  }
}

export const db = new TroDatabase()

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  landlordName: 'Nhà trọ',
  phone: '',
  address: '',
  bankBin: '',
  bankAccountNo: '',
  bankAccountName: '',
  defaultElectricPrice: 4000,
  defaultWaterPrice: 20000,
  defaultGarbageFee: 0,
  invoiceFooter: 'Cảm ơn quý khách. Vui lòng thanh toán khi nhận phiếu.',
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function ensureSettings(): Promise<Settings> {
  const existing = await db.settings.get('app')
  if (existing) return existing
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

/** Xin trinh duyet luu tru ben vung de trinh duyet khong xoa du lieu khi thieu bo nho. */
export async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return
  try {
    const already = await navigator.storage.persisted()
    if (!already) await navigator.storage.persist()
  } catch {
    // trinh duyet tu choi thi bo qua, du lieu van chay binh thuong
  }
}
