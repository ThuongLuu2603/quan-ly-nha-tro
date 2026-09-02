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

  let unsubscribeRealtime: (() => void) | undefined

  void supabase.auth.getSession().then(({ data }) => {
    setSession(data.session)
    setLoading(false)
    if (data.session) {
      void maybeSeedCloud().then(() => runSync())
      void subscribeRealtime(data.session.user.id).then((off) => {
        unsubscribeRealtime = off
      })
    }
  })

  const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
    setSession(next)
    if (next) {
      void maybeSeedCloud().then(() => runSync())
      void subscribeRealtime(next.user.id).then((off) => {
        unsubscribeRealtime?.()
        unsubscribeRealtime = off
      })
    } else {
      unsubscribeRealtime?.()
    }
  })

  const onOnline = () => scheduleSync(300)
  window.addEventListener('online', onOnline)

  return () => {
    sub.subscription.unsubscribe()
    window.removeEventListener('online', onOnline)
    unsubscribeRealtime?.()
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)

  const refreshConfig = useCallback(async () => {
    setLoading(true)
    const ok = await initSupabaseFromDb()
    setConfigured(ok)
    if (!ok) {
      setLoading(false)
      setSession(null)
      return
    }
    if (!hooksInstalled) {
      installSyncHooks()
      hooksInstalled = true
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
    await runSync()
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
    await runSync()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
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
