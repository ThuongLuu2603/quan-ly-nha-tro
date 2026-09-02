import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { onSyncStatus } from './engine'
import type { SyncStatus } from './types'

const LABEL: Record<SyncStatus, string> = {
  idle: '',
  syncing: 'Đang đồng bộ...',
  ok: 'Đã đồng bộ',
  offline: 'Offline — sẽ đồng bộ khi có mạng',
  error: 'Lỗi đồng bộ',
}

export function SyncBar() {
  const { configured, session, syncNow } = useAuth()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [detail, setDetail] = useState<string | undefined>()

  useEffect(() => {
    if (!configured || !session) return
    return onSyncStatus((next: SyncStatus, msg?: string) => {
      setStatus(next)
      setDetail(msg)
    })
  }, [configured, session])

  if (!configured || !session) return null
  if (status === 'idle') return null

  const tone =
    status === 'ok' ? 'ok' : status === 'offline' ? 'warn' : status === 'error' ? 'danger' : 'info'

  return (
    <div className={`sync-bar ${tone}`}>
      <span>{detail ? `${LABEL[status]}: ${detail}` : LABEL[status]}</span>
      {(status === 'error' || status === 'offline') && (
        <button className="btn ghost sm" onClick={() => void syncNow()}>
          Thử lại
        </button>
      )}
    </div>
  )
}
