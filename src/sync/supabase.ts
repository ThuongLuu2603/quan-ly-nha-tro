import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { db } from '../data/db'
import { SUPABASE_DEFAULT_ANON_KEY, SUPABASE_DEFAULT_URL } from './defaults'

let client: SupabaseClient | null = null
let clientFingerprint = ''
const configListeners = new Set<() => void>()

function fingerprint(url: string, anonKey: string): string {
  return `${url}|${anonKey}`
}

export function onSupabaseConfigChange(listener: () => void): () => void {
  configListeners.add(listener)
  return () => configListeners.delete(listener)
}

function notifyConfigChange(): void {
  for (const listener of configListeners) listener()
}

export function resolveSupabaseCredentials(settings?: {
  supabaseUrl?: string
  supabaseAnonKey?: string
} | null): { url: string; anonKey: string } | null {
  const url =
    settings?.supabaseUrl?.trim() ||
    (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
    ''
  const anonKey =
    settings?.supabaseAnonKey?.trim() ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
    ''
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function isSyncConfigured(settings?: {
  supabaseUrl?: string
  supabaseAnonKey?: string
} | null): boolean {
  return resolveSupabaseCredentials(settings) !== null
}

export async function initSupabaseFromDb(): Promise<boolean> {
  const settings = await db.settings.get('app')
  const creds = resolveSupabaseCredentials(settings)
  if (!creds) {
    client = null
    clientFingerprint = ''
    notifyConfigChange()
    return false
  }

  const fp = fingerprint(creds.url, creds.anonKey)
  if (client && clientFingerprint === fp) return true

  clientFingerprint = fp
  client = createClient(creds.url, creds.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  notifyConfigChange()
  return true
}

export function getSupabase(): SupabaseClient | null {
  return client
}

/** URL quay ve sau khi dang nhap Google (PWA tren GitHub Pages). */
export function authRedirectUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${window.location.origin}${normalized}`
}

export async function getSession(): Promise<Session | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export { SUPABASE_DEFAULT_ANON_KEY, SUPABASE_DEFAULT_URL }
