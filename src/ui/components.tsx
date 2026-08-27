import { useEffect, useId, useState, type ReactNode } from 'react'
import { formatMoney, parseMoneyInput } from '../domain/money'

export function Card({
  title,
  children,
  flush,
  action,
}: {
  title?: string
  children: ReactNode
  flush?: boolean
  action?: ReactNode
}) {
  return (
    <section className={flush ? 'card flush' : 'card'}>
      {title && (
        <div className="row between" style={{ padding: flush ? '14px 16px 0' : undefined }}>
          <div className="card-title" style={{ marginBottom: flush ? 10 : 12 }}>
            {title}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'decimal'
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      inputMode={inputMode}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: number
  onChange: (value: number) => void
  placeholder?: string
}) {
  const [text, setText] = useState(() => (value ? formatMoney(value) : ''))

  useEffect(() => {
    const parsed = parseMoneyInput(text)
    if (parsed !== value) setText(value ? formatMoney(value) : '')
    // chi dong bo khi gia tri ben ngoai doi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <input
      className="input align-right"
      inputMode="numeric"
      value={text}
      placeholder={placeholder ?? '0'}
      onChange={(e) => {
        const parsed = parseMoneyInput(e.target.value)
        setText(parsed ? formatMoney(parsed) : '')
        onChange(parsed)
      }}
    />
  )
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  invalid,
}: {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  invalid?: boolean
}) {
  return (
    <input
      className={invalid ? 'input align-right invalid' : 'input align-right'}
      inputMode="decimal"
      value={value === null ? '' : String(value)}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.]/g, '')
        onChange(raw === '' ? null : Number(raw))
      }}
    />
  )
}

export function DateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
  )
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  const id = useId()
  return (
    <select
      id={id}
      className="input"
      value={String(value)}
      onChange={(e) => {
        const found = options.find((o) => String(o.value) === e.target.value)
        if (found) onChange(found.value)
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet">
        <div className="row between" style={{ marginBottom: 6 }}>
          <div className="sheet-title" style={{ marginBottom: 0 }}>
            {title}
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Đóng">
            Đóng
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon, text, action }: { icon: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div>{text}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={className ? `num ${className}` : 'num'}>{formatMoney(value)} đ</span>
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'muted' | 'accent'; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

export function Banner({ tone, children }: { tone: 'warn' | 'danger' | 'info'; children: ReactNode }) {
  return <div className={`banner ${tone}`}>{children}</div>
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 2600)
    return () => clearTimeout(timer)
  }, [message])

  const node = message ? <div className="toast">{message}</div> : null
  return { toast: setMessage, toastNode: node }
}
