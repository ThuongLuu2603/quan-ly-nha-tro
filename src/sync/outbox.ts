import { db } from '../data/db'
import type { SyncEntityType } from './types'

export function entityKey(type: SyncEntityType, id: string): string {
  return `${type}:${id}`
}

/** Dam bao syncAfterMutation doi het hang doi tu Dexie hooks. */
let pendingQueues: Promise<void> = Promise.resolve()

export async function queueSync(
  entityType: SyncEntityType,
  entityId: string,
  payload: unknown | null,
  deleted: boolean,
  updatedAt?: string,
): Promise<void> {
  const stamp = updatedAt ?? new Date().toISOString()
  pendingQueues = pendingQueues.then(async () => {
    await db.syncOutbox.put({
      entityKey: entityKey(entityType, entityId),
      entityType,
      entityId,
      payload: deleted ? null : payload,
      updatedAt: stamp,
      deleted,
    })
  })
  return pendingQueues
}

export async function drainSyncQueue(): Promise<void> {
  await pendingQueues
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
