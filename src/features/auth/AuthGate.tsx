import type { ReactNode } from 'react'
import { useAuth } from '../../sync/AuthProvider'
import { LoginPage } from './LoginPage'
import { SyncSetupPage } from './SyncSetupPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const { configured, loading, session } = useAuth()

  if (loading) {
    return (
      <div className="auth-loading">
        <div>Đang tải...</div>
      </div>
    )
  }

  if (!configured) return <SyncSetupPage />
  if (!session) return <LoginPage />
  return children
}
