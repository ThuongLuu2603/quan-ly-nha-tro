import type { Invoice, Reading, Room, Settings, Tenancy, Tenant } from '../domain/types'
import { db } from './db'

export interface BackupFile {
  format: 'quanlytro-backup'
  version: 1
  exportedAt: string
  rooms: Room[]
  tenancies: Tenancy[]
  tenants: Tenant[]
  readings: Reading[]
  invoices: Invoice[]
  settings: Settings | null
}

export async function exportBackup(): Promise<BackupFile> {
  const [rooms, tenancies, tenants, readings, invoices, settings] = await Promise.all([
    db.rooms.toArray(),
    db.tenancies.toArray(),
    db.tenants.toArray(),
    db.readings.toArray(),
    db.invoices.toArray(),
    db.settings.get('app'),
  ])
  return {
    format: 'quanlytro-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    rooms,
    tenancies,
    tenants,
    readings,
    invoices,
    settings: settings ?? null,
  }
}

export function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BackupFile>
  return candidate.format === 'quanlytro-backup' && Array.isArray(candidate.rooms)
}

export async function importBackup(file: BackupFile): Promise<void> {
  await db.transaction(
    'rw',
    [db.rooms, db.tenancies, db.tenants, db.readings, db.invoices, db.settings],
    async () => {
      await Promise.all([
        db.rooms.clear(),
        db.tenancies.clear(),
        db.tenants.clear(),
        db.readings.clear(),
        db.invoices.clear(),
      ])
      await db.rooms.bulkPut(file.rooms)
      await db.tenancies.bulkPut(file.tenancies)
      await db.tenants.bulkPut(file.tenants)
      await db.readings.bulkPut(file.readings)
      await db.invoices.bulkPut(file.invoices)
      if (file.settings) await db.settings.put({ ...file.settings, id: 'app' })
    },
  )
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.rooms, db.tenancies, db.tenants, db.readings, db.invoices, async () => {
    await Promise.all([
      db.rooms.clear(),
      db.tenancies.clear(),
      db.tenants.clear(),
      db.readings.clear(),
      db.invoices.clear(),
    ])
  })
}
