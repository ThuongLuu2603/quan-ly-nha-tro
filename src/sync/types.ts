export type SyncEntityType = 'room' | 'tenancy' | 'tenant' | 'reading' | 'invoice' | 'settings'

export interface SyncOutboxRow {
  entityKey: string
  entityType: SyncEntityType
  entityId: string
  payload: unknown | null
  updatedAt: string
  deleted: boolean
}

export interface RemoteSyncRecord {
  user_id: string
  entity_type: SyncEntityType
  entity_id: string
  payload: unknown | null
  deleted: boolean
  updated_at: string
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline' | 'error'
