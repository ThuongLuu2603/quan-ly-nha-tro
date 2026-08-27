import { useState } from 'react'
import { addPayment } from '../../data/actions'
import { today } from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { ID, PaymentMethod } from '../../domain/types'
import { DateInput, Field, MoneyInput, Select, Sheet, TextInput } from '../../ui/components'

export function PaymentSheet({
  invoiceId,
  remaining,
  isRefund,
  onClose,
}: {
  invoiceId: ID
  remaining: number
  isRefund: boolean
  onClose: () => void
}) {
  const [amount, setAmount] = useState(Math.abs(remaining))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')

  const save = async () => {
    if (amount <= 0) return
    await addPayment(invoiceId, {
      amount: isRefund ? -amount : amount,
      method,
      date,
      note: note.trim() || undefined,
    })
    onClose()
  }

  return (
    <Sheet title={isRefund ? 'Ghi nhận đã trả khách' : 'Ghi nhận đã thu'} onClose={onClose}>
      <div className="stack">
        <Field label="Số tiền" hint={`Còn lại ${formatMoney(Math.abs(remaining))} đ`}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm grow" onClick={() => setAmount(Math.abs(remaining))}>
            Toàn bộ
          </button>
          <button className="btn sm grow" onClick={() => setAmount(Math.round(Math.abs(remaining) / 2))}>
            Một nửa
          </button>
        </div>

        <Field label="Hình thức">
          <Select
            value={method}
            onChange={setMethod}
            options={[
              { value: 'cash' as PaymentMethod, label: 'Tiền mặt' },
              { value: 'transfer' as PaymentMethod, label: 'Chuyển khoản' },
            ]}
          />
        </Field>

        <Field label="Ngày">
          <DateInput value={date} onChange={setDate} />
        </Field>

        <Field label="Ghi chú">
          <TextInput value={note} onChange={setNote} placeholder="Không bắt buộc" />
        </Field>

        <button className="btn primary block" onClick={save} disabled={amount <= 0}>
          Lưu
        </button>
      </div>
    </Sheet>
  )
}
