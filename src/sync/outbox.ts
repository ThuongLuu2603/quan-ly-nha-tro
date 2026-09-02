import { db } from '../data/db'
import type { SyncEntityType } from './types'

export function entityKey(type: SyncEntityType, id: string): string {
  return `${type}:${id}`
}

export async function queueSync(
  entityType: SyncEntityType,
  entityId: string,
  payload: unknown | null,
  deleted: boolean,
): Promise<void> {
  const row = {
    entityKey: entityKey(entityType, entityId),
    entityType,
    entityId,
    payload: deleted ? null : payload,
    updatedAt: new Date().toISOString(),
    deleted,
  }
  await db.syncOutbox.put(row)
}

export async function clearOutboxEntry(entityType: SyncEntityType, entityId: string): Promise<void> {
  await db.syncOutbox.delete(entityKey(entityType, entityId))
}

export async function getLastPullAt(): Promise<string | null> {
  const row = await db.syncMeta.get('lastPullAt')
  return row?.value ?? null
}

export async function setLastPullAt(iso: string): Promise<void> {
  await db.syncMeta.put({ key: 'lastPullAt', value: iso })
}
