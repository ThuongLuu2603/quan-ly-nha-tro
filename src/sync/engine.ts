import { db } from '../data/db'
import { isApplyingRemote } from './guard'
import { applyRemoteRecord } from './apply'
import { entityKey, getLastPullAt, queueSync, setLastPullAt } from './outbox'
import { getSupabase } from './supabase'
import type { RemoteSyncRecord, SyncEntityType, SyncStatus } from './types'

type StatusListener = (status: SyncStatus, detail?: string) => void

let syncing = false
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

  await pushMissingLocal(auth.session.user.id)
}

interface RunSyncOptions {
  /** Keo lai toan bo ban ghi tu cloud — dung khi bam "Dong bo ngay". */
  fullPull?: boolean
}

export async function runSync(options: RunSyncOptions = {}): Promise<void> {
  const supabase = getSupabase()
  if (!supabase || syncing) return

  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) return

  if (!navigator.onLine) {
    notify('offline')
    return
  }

  syncing = true
  notify('syncing')

  try {
    await pushMissingLocal(auth.session.user.id)
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
  }
}

/** Day nhung ban ghi chi co tren may nay len cloud, khong ghi de du lieu da co. */
async function pushMissingLocal(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const { data: remote, error } = await supabase
    .from('sync_records')
    .select('entity_type, entity_id')
    .eq('user_id', userId)
    .eq('deleted', false)

  if (error) throw error

  const remoteKeys = new Set((remote ?? []).map((row) => `${row.entity_type}:${row.entity_id}`))

  const [rooms, tenancies, tenants, readings, invoices, settings] = await Promise.all([
    db.rooms.toArray(),
    db.tenancies.toArray(),
    db.tenants.toArray(),
    db.readings.toArray(),
    db.invoices.toArray(),
    db.settings.get('app'),
  ])

  const queueIfMissing = async (
    entityType: SyncEntityType,
    entityId: string,
    payload: unknown,
  ): Promise<void> => {
    const key = entityKey(entityType, entityId)
    if (remoteKeys.has(key) || (await db.syncOutbox.get(key))) return
    await queueSync(entityType, entityId, payload, false)
  }

  for (const room of rooms) await queueIfMissing('room', room.id, room)
  for (const tenancy of tenancies) await queueIfMissing('tenancy', tenancy.id, tenancy)
  for (const tenant of tenants) await queueIfMissing('tenant', tenant.id, tenant)
  for (const reading of readings) await queueIfMissing('reading', reading.id, reading)
  for (const invoice of invoices) await queueIfMissing('invoice', invoice.id, invoice)
  if (settings) await queueIfMissing('settings', 'app', settings)
}

async function pushOutbox(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const rows = await db.syncOutbox.toArray()
  if (rows.length === 0) return

  const payload = rows.map((row) => ({
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

  // Chi xoa khoi outbox nhung ban da day len server thanh cong.
  await db.syncOutbox.bulkDelete(rows.map((r) => r.entityKey))
}

async function pullRemote(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  const since = (await getLastPullAt()) ?? '1970-01-01T00:00:00.000Z'
  const { data, error } = await supabase
    .from('sync_records')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })

  if (error) throw error

  let latest = since
  for (const row of (data ?? []) as RemoteSyncRecord[]) {
    const local = await db.syncOutbox.get(`${row.entity_type}:${row.entity_id}`)
    if (local && local.updatedAt > row.updated_at) {
      latest = row.updated_at > latest ? row.updated_at : latest
      continue
    }
    await applyRemoteRecord(row)
    latest = row.updated_at > latest ? row.updated_at : latest
  }

  if ((data ?? []).length > 0) {
    await setLastPullAt(latest)
  }
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
