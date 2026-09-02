import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  installSyncHooks,
  maybeSeedCloud,
  pushAllLocal,
  runSync,
  scheduleSync,
  subscribeRealtime,
  unsubscribeRealtime,
} from './engine'
import {
  authRedirectUrl,
  getSupabase,
  initSupabaseFromDb,
  onSupabaseConfigChange,
} from './supabase'

interface AuthContextValue {
  configured: boolean
  loading: boolean
  online: boolean
  canEdit: boolean
  session: Session | null
  user: User | null
  signInEmail: (email: string, password: string) => Promise<string | null>
  signUpEmail: (email: string, password: string) => Promise<string | null>
  signInGoogle: () => Promise<string | null>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>
  refreshConfig: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

let hooksInstalled = false

function bindAuthListeners(
  setSession: (s: Session | null) => void,
  setLoading: (v: boolean) => void,
): () => void {
  const supabase = getSupabase()
  if (!supabase) {
    setLoading(false)
    return () => undefined
  }

  const finishLoading = () => setLoading(false)
  const timeout = window.setTimeout(finishLoading, 8_000)

  void supabase.auth
    .getSession()
    .then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        void maybeSeedCloud().then(() => runSync({ fullPull: true }))
      }
    })
    .catch(() => setSession(null))
    .finally(() => {
      window.clearTimeout(timeout)
      finishLoading()
    })

  const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
    setSession(next)
    if (next) {
      void maybeSeedCloud().then(() => runSync({ fullPull: true }))
      void subscribeRealtime(next.user.id)
    } else {
      unsubscribeRealtime()
    }
  })

  const onOnline = () => scheduleSync(300)
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleSync(300)
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onOnline)

  return () => {
    sub.subscription.unsubscribe()
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onOnline)
    unsubscribeRealtime()
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const onStatus = () => setOnline(navigator.onLine)
    window.addEventListener('online', onStatus)
    window.addEventListener('offline', onStatus)
    return () => {
      window.removeEventListener('online', onStatus)
      window.removeEventListener('offline', onStatus)
    }
  }, [])

  const canEdit = configured && !!session && online

  const refreshConfig = useCallback(async () => {
    setLoading(true)
    try {
      const ok = await initSupabaseFromDb()
      setConfigured(ok)
      if (!ok) {
        setSession(null)
        setLoading(false)
        return
      }
      if (!hooksInstalled) {
        installSyncHooks()
        hooksInstalled = true
      }
    } catch {
      setConfigured(false)
      setSession(null)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshConfig()
    return onSupabaseConfigChange(() => {
      void refreshConfig()
    })
  }, [refreshConfig])

  useEffect(() => {
    if (!configured) return
    return bindAuthListeners(setSession, setLoading)
  }, [configured])

  const signInEmail = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return 'Chưa bật đồng bộ — vào Cài đặt bấm Kết nối'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    await runSync({ fullPull: true })
    return null
  }, [])

  const signUpEmail = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return 'Chưa bật đồng bộ — vào Cài đặt bấm Kết nối'
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) return error.message
    await pushAllLocal()
    return null
  }, [])

  const signInGoogle = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return 'Chưa bật đồng bộ — vào Cài đặt bấm Kết nối'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    })
    if (error) return error.message
    return null
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const syncNow = useCallback(async () => {
    await runSync({ fullPull: true })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      online,
      canEdit,
      session,
      user: session?.user ?? null,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      syncNow,
      refreshConfig,
    }),
    [
      configured,
      loading,
      online,
      canEdit,
      session,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      syncNow,
      refreshConfig,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider')
  return ctx
}
