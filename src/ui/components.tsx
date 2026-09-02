import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { formatMoney, formatNumber, parseMoneyInput, parseNumberInput } from '../domain/money'
import { EmptyIcon, type EmptyIconKind } from './icons'

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

/**
 * Giu chu dang go trong state rieng thay vi doc thang tu prop.
 *
 * O trang Cai dat, moi phim go deu ghi xuong IndexedDB roi doi gia tri vong ve
 * qua useLiveQuery. Vong lap do tre vai nhip nen neu o nhap doc thang tu prop
 * thi chu cu se de len chu moi: go nhanh bi rot chu, con bo go tieng Viet
 * (Unikey, ban phim Android) mat dau vet dang sua nen cho ra chu vo nghia kieu
 * "Dong.g.g". Khi con tro dang o trong o thi khong nhan gia tri tu ngoai vao.
 */
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
  const [draft, setDraft] = useState(value)
  const typing = useRef(false)
  const composing = useRef(false)

  useEffect(() => {
    if (typing.current) return
    setDraft(value)
  }, [value])

  return (
    <input
      className="input"
      type={type}
      value={draft}
      inputMode={inputMode}
      placeholder={placeholder}
      onFocus={() => {
        typing.current = true
      }}
      onBlur={() => {
        typing.current = false
        // Roi o thi hien lai dung thu da luu, vi du so tai khoan da bo dau cach.
        setDraft(value)
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(e) => {
        composing.current = false
        onChange(e.currentTarget.value)
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        if (!composing.current) onChange(e.target.value)
      }}
    />
  )
}

function selectAllOnFocus(event: FocusEvent<HTMLInputElement>): void {
  event.target.select()
}

export function MoneyInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [text, setText] = useState(() => formatMoney(value))
  const typing = useRef(false)

  // Cung ly do nhu TextInput: gia tri cu quay ve cham se de len so dang go.
  useEffect(() => {
    if (typing.current) return
    setText(formatMoney(value))
  }, [value])

  return (
    <input
      className="input align-right"
      inputMode="numeric"
      value={text}
      placeholder={placeholder ?? '0'}
      disabled={disabled}
      onFocus={(e) => {
        typing.current = true
        selectAllOnFocus(e)
      }}
      onBlur={() => {
        typing.current = false
        setText(formatMoney(value))
      }}
      onChange={(e) => {
        const parsed = parseMoneyInput(e.target.value)
        setText(formatMoney(parsed))
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
  const [text, setText] = useState(() => (value === null ? '' : formatNumber(value)))
  const typing = useRef(false)

  useEffect(() => {
    if (typing.current) return
    setText(value === null ? '' : formatNumber(value))
  }, [value])

  return (
    <input
      className={invalid ? 'input align-right invalid' : 'input align-right'}
      inputMode="decimal"
      value={text}
      placeholder={placeholder ?? '0'}
      onFocus={(e) => {
        typing.current = true
        selectAllOnFocus(e)
      }}
      onBlur={() => {
        typing.current = false
        setText(value === null ? '' : formatNumber(value))
      }}
      onChange={(e) => {
        const parsed = parseNumberInput(e.target.value)
        setText(parsed === null ? '' : formatNumber(parsed))
        onChange(parsed)
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

export function EmptyState({
  icon,
  text,
  action,
}: {
  icon: EmptyIconKind
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="big">
        <EmptyIcon kind={icon} />
      </div>
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

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export function useToast() {
  const [state, setState] = useState<{ message: string; action?: ToastAction } | null>(null)

  useEffect(() => {
    if (!state) return
    // Co nut bam thi de lau hon cho kip doc va bam.
    const timer = setTimeout(() => setState(null), state.action ? 5200 : 2600)
    return () => clearTimeout(timer)
  }, [state])

  const toast = useCallback((message: string, action?: ToastAction) => {
    setState({ message, action })
  }, [])

  const node = state ? (
    <div className="toast">
      <span>{state.message}</span>
      {state.action && (
        <button
          className="toast-action"
          onClick={() => {
            void state.action?.run()
            setState(null)
          }}
        >
          {state.action.label}
        </button>
      )}
    </div>
  ) : null

  return { toast, toastNode: node }
}
