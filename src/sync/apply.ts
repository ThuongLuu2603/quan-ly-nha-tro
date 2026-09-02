import { db } from '../data/db'
import type { Invoice, Reading, Room, Settings, Tenancy, Tenant } from '../domain/types'
import { clearOutboxEntry } from './outbox'
import { withApplyingRemote } from './guard'
import type { RemoteSyncRecord, SyncEntityType } from './types'

export async function applyRemoteRecord(record: RemoteSyncRecord): Promise<void> {
  await withApplyingRemote(async () => {
    if (record.deleted) {
      await deleteLocal(record.entity_type, record.entity_id)
      await clearOutboxEntry(record.entity_type, record.entity_id)
      return
    }

    if (!record.payload || typeof record.payload !== 'object') return

    switch (record.entity_type) {
      case 'room':
        await db.rooms.put(record.payload as Room)
        break
      case 'tenancy':
        await db.tenancies.put(record.payload as Tenancy)
        break
      case 'tenant':
        await db.tenants.put(record.payload as Tenant)
        break
      case 'reading':
        await db.readings.put(record.payload as Reading)
        break
      case 'invoice':
        await db.invoices.put(record.payload as Invoice)
        break
      case 'settings':
        await db.settings.put({ ...(record.payload as Settings), id: 'app' })
        break
      default: {
        const _exhaustive: never = record.entity_type
        return _exhaustive
      }
    }
    await clearOutboxEntry(record.entity_type, record.entity_id)
  })
}

async function deleteLocal(entityType: SyncEntityType, entityId: string): Promise<void> {
  switch (entityType) {
    case 'room':
      await db.rooms.delete(entityId)
      break
    case 'tenancy':
      await db.tenancies.delete(entityId)
      break
    case 'tenant':
      await db.tenants.delete(entityId)
      break
    case 'reading':
      await db.readings.delete(entityId)
      break
    case 'invoice':
      await db.invoices.delete(entityId)
      break
    case 'settings':
      break
    default: {
      const _exhaustive: never = entityType
      return _exhaustive
    }
  }
}
