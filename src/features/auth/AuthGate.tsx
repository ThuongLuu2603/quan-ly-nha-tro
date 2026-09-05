import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../../sync/AuthProvider'
import { LoginPage } from './LoginPage'
import { SyncSetupPage } from './SyncSetupPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const { configured, loading, session, refreshConfig } = useAuth()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const timer = window.setTimeout(() => setSlow(true), 12_000)
    return () => window.clearTimeout(timer)
  }, [loading])

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="stack tight" style={{ textAlign: 'center', padding: 24 }}>
          <div>Đang tải...</div>
          {slow && (
            <>
              <div className="small muted">Quá lâu — thử bấm tải lại hoặc kiểm tra mạng.</div>
              <button className="btn sm" onClick={() => void refreshConfig()}>
                Tải lại
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!configured) return <SyncSetupPage />
  if (!session) return <LoginPage />
  return children
}
