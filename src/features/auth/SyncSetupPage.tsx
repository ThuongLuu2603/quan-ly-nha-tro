import { saveSettings } from '../../data/actions'
import { useDataset } from '../../data/store'
import { useAuth } from '../../sync/AuthProvider'
import { SUPABASE_DEFAULT_ANON_KEY, SUPABASE_DEFAULT_URL } from '../../sync/defaults'
import { Banner, Card } from '../../ui/components'
import { Page } from '../../ui/Page'

export function SyncSetupPage() {
  const data = useDataset()
  const { refreshConfig } = useAuth()

  const connect = async () => {
    await saveSettings({
      supabaseUrl: SUPABASE_DEFAULT_URL,
      supabaseAnonKey: SUPABASE_DEFAULT_ANON_KEY,
    })
    await refreshConfig()
  }

  const alreadyHasKeys = Boolean(data.settings.supabaseUrl && data.settings.supabaseAnonKey)

  return (
    <Page title="Bật đồng bộ" subtitle="Một lần duy nhất">
      <Card>
        <div className="stack tight">
          <button className="btn primary block" onClick={connect}>
            {alreadyHasKeys ? 'Kết nối lại' : 'Bấm để bật đồng bộ'}
          </button>

          <Banner tone="info">
            Sau khi bấm, app sẽ hỏi đăng nhập (email hoặc Google). Cùng tài khoản trên mọi điện
            thoại = cùng dữ liệu khi có mạng.
          </Banner>
        </div>
      </Card>
    </Page>
  )
}
