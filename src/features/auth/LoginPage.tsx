import { useState } from 'react'
import { useAuth } from '../../sync/AuthProvider'
import { Banner, Field, TextInput } from '../../ui/components'
import { Page } from '../../ui/Page'

export function LoginPage() {
  const { signInEmail, signUpEmail, signInGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setInfo(null)
    setBusy(true)
    const err =
      mode === 'login'
        ? await signInEmail(email.trim(), password)
        : await signUpEmail(email.trim(), password)
    setBusy(false)
    if (err) setError(err)
    else if (mode === 'signup') {
      setInfo('Đã tạo tài khoản. Nếu Supabase yêu cầu xác nhận email, hãy mở mail rồi đăng nhập.')
      setMode('login')
    }
  }

  return (
    <Page title="Đăng nhập đồng bộ" subtitle="Một tài khoản — dùng chung trên mọi điện thoại">
      <Banner tone="info">
        Dữ liệu vẫn lưu trên máy để dùng offline. Khi có mạng, app tự đồng bộ lên cloud và máy khác
        sẽ nhận được. Trên mọi máy hãy dùng <strong>cùng một cách đăng nhập</strong> (chỉ Google, hoặc
        chỉ email+mật khẩu) — đăng nhập khác kiểu dù cùng email vẫn là hai tài khoản cloud khác nhau.
      </Banner>

      <div className="card stack">
        <Field label="Email">
          <TextInput
            value={email}
            onChange={setEmail}
            placeholder="email@example.com"
            type="email"
          />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 6 ký tự">
          <TextInput value={password} onChange={setPassword} type="password" placeholder="••••••" />
        </Field>

        {error && <Banner tone="danger">{error}</Banner>}
        {info && <Banner tone="info">{info}</Banner>}

        <button className="btn primary block" disabled={busy || !email || password.length < 6} onClick={submit}>
          {busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>

        <button
          className="btn block"
          disabled={busy}
          onClick={async () => {
            setError(null)
            const err = await signInGoogle()
            if (err) setError(err)
          }}
        >
          Đăng nhập bằng Google
        </button>

        <button
          className="btn ghost block"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập'}
        </button>
      </div>
    </Page>
  )
}
