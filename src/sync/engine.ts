import { db } from '../data/db'
import { isApplyingRemote } from './guard'
import { applyRemoteRecord } from './apply'
import { drainSyncQueue, getLastPullAt, queueSync, setLastPullAt } from './outbox'
import { getSupabase } from './supabase'
import type { RemoteSyncRecord, SyncEntityType, SyncStatus } from './types'

type StatusListener = (status: SyncStatus, detail?: string) => void

let syncing = false
let syncQueued = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<StatusListener>()
let realtimeUserId: string | null = null
let realtimeTeardown: (() => void) | null = null

export function onSyncStatus(listener: StatusListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(status: SyncStatus, detail?: string): void {
  for (const listener of listeners) listener(status, detail)
}

export interface SyncDiagnostics {
  localRooms: number
  cloudRooms: number
  pendingOutbox: number
}

export async function getSyncDiagnostics(): Promise<SyncDiagnostics | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return null

  const [localRooms, pendingOutbox, cloudRooms] = await Promise.all([
    db.rooms.count(),
    db.syncOutbox.count(),
    countCloudEntities(auth.session.user.id, 'room'),
  ])

  return { localRooms, cloudRooms, pendingOutbox }
}

export function scheduleSync(delayMs = 1500): void {
  if (!getSupabase()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runSync()
  }, delayMs)
}

export async function maybeSeedCloud(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return

  const { count, error } = await supabase
    .from('sync_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', auth.session.user.id)
  if (error) return

  const localRooms = await db.rooms.count()
  if ((count ?? 0) === 0 && localRooms > 0) {
    await pushAllLocal()
    return
  }
}

export async function syncAfterMutation(): Promise<void> {
  if (!navigator.onLine) return
  await drainSyncQueue()
  await runSync()
}

interface RunSyncOptions {
  /** Keo lai toan bo ban ghi tu cloud — dung khi bam "Dong bo ngay". */
  fullPull?: boolean
}

export async function runSync(options: RunSyncOptions = {}): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  if (syncing) {
    syncQueued = true
    return
  }

  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return

  if (!navigator.onLine) {
    notify('offline')
    return
  }

  syncing = true
  notify('syncing')

  try {
    await drainSyncQueue()
    await pushOutbox(auth.session.user.id)

    if (options.fullPull) {
      await setLastPullAt('1970-01-01T00:00:00.000Z')
    }
    await pullRemote(auth.session.user.id)
    notify('ok')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi đồng bộ'
    notify('error', message)
  } finally {
    syncing = false
    if (syncQueued) {
      syncQueued = false
      void runSync(options)
    }
  }
}

async function pushOutbox(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const rows = await db.syncOutbox.toArray()
  if (rows.length === 0) return

  const CHUNK = 80
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const payload = chunk.map((row) => ({
      user_id: userId,
      entity_type: row.entityType,
      entity_id: row.entityId,
      payload: row.deleted ? null : row.payload,
      deleted: row.deleted,
      updated_at: row.updatedAt,
    }))

    const { error } = await supabase.from('sync_records').upsert(payload, {
      onConflict: 'user_id,entity_type,entity_id',
    })
    if (error) throw error
    await db.syncOutbox.bulkDelete(chunk.map((r) => r.entityKey))
  }
}

async function pullRemote(userId: string): Promise<void> {
  const since = (await getLastPullAt()) ?? '1970-01-01T00:00:00.000Z'
  const rows = await fetchRemoteRecords(userId, since)

  let latest = since
  for (const row of rows) {
    const key = `${row.entity_type}:${row.entity_id}`
    const pending = await db.syncOutbox.get(key)

    if (row.deleted) {
      await applyRemoteRecord(row)
      latest = row.updated_at > latest ? row.updated_at : latest
      continue
    }

    // Khong khoi phuc ban ghi dang cho xoa tren may nay.
    if (pending?.deleted) {
      latest = row.updated_at > latest ? row.updated_at : latest
      continue
    }

    if (pending && pending.updatedAt > row.updated_at) {
      latest = row.updated_at > latest ? row.updated_at : latest
      continue
    }

    await applyRemoteRecord(row)
    latest = row.updated_at > latest ? row.updated_at : latest
  }

  if (rows.length > 0) {
    await setLastPullAt(latest)
  }
}

const REMOTE_PAGE_SIZE = 500

async function countCloudEntities(userId: string, entityType: SyncEntityType): Promise<number> {
  const supabase = getSupabase()
  if (!supabase) return 0

  const { count, error } = await supabase
    .from('sync_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('deleted', false)

  if (error) throw error
  return count ?? 0
}

async function fetchRemoteRecords(userId: string, since: string): Promise<RemoteSyncRecord[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const rows: RemoteSyncRecord[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('sync_records')
      .select('*')
      .eq('user_id', userId)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .range(from, from + REMOTE_PAGE_SIZE - 1)

    if (error) throw error
    if (!data?.length) break

    rows.push(...(data as RemoteSyncRecord[]))
    if (data.length < REMOTE_PAGE_SIZE) break
    from += REMOTE_PAGE_SIZE
  }

  return rows
}

/** Day toan bo du lieu local len cloud (sau khi nhap backup hoac lan dau dang nhap). */
export async function pushAllLocal(): Promise<void> {
  const [rooms, tenancies, tenants, readings, invoices, settings] = await Promise.all([
    db.rooms.toArray(),
    db.tenancies.toArray(),
    db.tenants.toArray(),
    db.readings.toArray(),
    db.invoices.toArray(),
    db.settings.get('app'),
  ])

  for (const room of rooms) await queueSync('room', room.id, room, false)
  for (const tenancy of tenancies) await queueSync('tenancy', tenancy.id, tenancy, false)
  for (const tenant of tenants) await queueSync('tenant', tenant.id, tenant, false)
  for (const reading of readings) await queueSync('reading', reading.id, reading, false)
  for (const invoice of invoices) await queueSync('invoice', invoice.id, invoice, false)
  if (settings) await queueSync('settings', 'app', settings, false)

  await runSync()
}

/** Xoa du lieu tren cloud khi nguoi dung chon "Xoa toan bo" tren may. */
export async function clearRemoteData(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return
  const { error } = await supabase.from('sync_records').delete().eq('user_id', auth.session.user.id)
  if (error) throw error
  await setLastPullAt(new Date().toISOString())
}

export function installSyncHooks(): void {
  hookTable(db.rooms, 'room')
  hookTable(db.tenancies, 'tenancy')
  hookTable(db.tenants, 'tenant')
  hookTable(db.readings, 'reading')
  hookTable(db.invoices, 'invoice')
  hookTable(db.settings, 'settings')
}

function hookTable<T extends { id: string }>(
  table: {
    hook: (
      event: 'creating' | 'updating' | 'deleting',
      handler: (...args: never[]) => unknown,
    ) => void
  },
  entityType: SyncEntityType,
): void {
  table.hook('creating', (_pk, obj: T) => {
    if (isApplyingRemote()) return
    void queueSync(entityType, String(obj.id), obj, false)
    scheduleSync()
  })
  table.hook('updating', (mods, _pk, obj: T) => {
    if (isApplyingRemote()) return
    const patch = typeof mods === 'object' && mods !== null ? (mods as Partial<T>) : {}
    void queueSync(entityType, String(obj.id), { ...obj, ...patch }, false)
    scheduleSync()
  })
  table.hook('deleting', (pk) => {
    if (isApplyingRemote()) return
    void queueSync(entityType, String(pk), null, true)
    scheduleSync()
  })
}

export async function subscribeRealtime(userId: string): Promise<() => void> {
  const supabase = getSupabase()
  if (!supabase) return () => undefined

  if (realtimeUserId === userId && realtimeTeardown) {
    return realtimeTeardown
  }

  realtimeTeardown?.()
  realtimeTeardown = null
  realtimeUserId = null

  const channel = supabase
    .channel(`sync:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sync_records',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        scheduleSync(400)
      },
    )
    .subscribe()

  const teardown = () => {
    void supabase.removeChannel(channel)
    if (realtimeTeardown === teardown) {
      realtimeTeardown = null
      realtimeUserId = null
    }
  }

  realtimeUserId = userId
  realtimeTeardown = teardown
  return teardown
}

export function unsubscribeRealtime(): void {
  realtimeTeardown?.()
  realtimeTeardown = null
  realtimeUserId = null
}
