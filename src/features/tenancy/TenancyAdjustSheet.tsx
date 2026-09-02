import { useMemo, useState } from 'react'
import { adjustTenancy } from '../../data/actions'
import * as dt from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { ID, Room, Tenancy } from '../../domain/types'
import { Field, MoneyInput, Select, Sheet, TextInput } from '../../ui/components'

const CYCLE_DAYS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `Ngày ${i + 1}` }))

export function TenancyAdjustSheet({
  room,
  tenancy,
  onClose,
  onSaved,
}: {
  room: Room
  tenancy: Tenancy
  onClose: () => void
  onSaved: (invoiceId: ID | null) => void
}) {
  const [rent, setRent] = useState(tenancy.rent)
  const [deposit, setDeposit] = useState(tenancy.deposit)
  const [cycleDay, setCycleDay] = useState(tenancy.cycleDay)
  const [issueDepositInvoice, setIssueDepositInvoice] = useState(true)
  const [note, setNote] = useState(tenancy.note ?? '')
  const [saving, setSaving] = useState(false)

  const depositIncrease = Math.max(0, deposit - tenancy.deposit)
  const rentChanged = rent !== tenancy.rent
  const depositChanged = deposit !== tenancy.deposit
  const cycleDayChanged = cycleDay !== tenancy.cycleDay
  const noteChanged = note.trim() !== (tenancy.note ?? '')
  const canSave =
    rent > 0 &&
    deposit >= 0 &&
    cycleDay >= 1 &&
    cycleDay <= 31 &&
    (rentChanged || depositChanged || cycleDayChanged || noteChanged)

  const preview = useMemo(() => {
    const parts: string[] = []
    if (rentChanged) {
      parts.push(`Giá thuê mới áp dụng từ phiếu kỳ ${dt.formatDate(tenancy.rentPaidThrough)} trở đi`)
    }
    if (cycleDayChanged) {
      parts.push(`Mốc ngày mới: ngày ${cycleDay} hàng tháng — áp dụng từ kỳ chưa thu`)
    }
    if (depositIncrease > 0 && issueDepositInvoice) {
      parts.push(`Tạo phiếu thu cọc bổ sung ${formatMoney(depositIncrease)} đ`)
    } else if (depositIncrease > 0) {
      parts.push(`Cập nhật cọc đang giữ (+${formatMoney(depositIncrease)} đ), không tạo phiếu`)
    } else if (deposit < tenancy.deposit) {
      parts.push('Giảm số cọc đang giữ — app không tự hoàn tiền')
    }
    return parts
  }, [
    rentChanged,
    cycleDayChanged,
    cycleDay,
    depositIncrease,
    issueDepositInvoice,
    deposit,
    tenancy.deposit,
    tenancy.rentPaidThrough,
  ])

  const save = async () => {
    if (!canSave || saving) return
    setSaving(true)
    const invoiceId = await adjustTenancy({
      room,
      tenancy,
      rent,
      deposit,
      cycleDay,
      issueDepositInvoice: depositIncrease > 0 ? issueDepositInvoice : false,
      note: note.trim() || undefined,
    })
    onSaved(invoiceId)
    onClose()
  }

  return (
    <Sheet title={`Sửa lượt thuê · ${room.name}`} onClose={onClose}>
      <div className="stack">
        <Field
          label="Giá thuê / tháng"
          hint={`Giá mới chỉ tính từ kỳ chưa thu — hiện đã đóng tới ${dt.formatDate(tenancy.rentPaidThrough)}`}
        >
          <MoneyInput value={rent} onChange={setRent} />
        </Field>

        <Field
          label="Mốc ngày phát phiếu"
          hint="Ngày trong tháng tới kỳ thu tiền phòng — chỉ đổi cho các kỳ sau mốc đã đóng"
        >
          <Select value={cycleDay} onChange={setCycleDay} options={CYCLE_DAYS} />
        </Field>

        <Field
          label="Tiền cọc đang giữ"
          hint={
            tenancy.deposit > 0
              ? `Hiện giữ ${formatMoney(tenancy.deposit)} đ — tăng số này nếu thu thêm cọc`
              : 'Trước chưa thu cọc — nhập tổng cọc đang giữ sau khi thu'
          }
        >
          <MoneyInput value={deposit} onChange={setDeposit} />
        </Field>

        {depositIncrease > 0 && (
          <label className="row" style={{ gap: 10 }}>
            <input
              type="checkbox"
              checked={issueDepositInvoice}
              onChange={(e) => setIssueDepositInvoice(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <span className="small">
              Tạo phiếu thu cọc bổ sung <strong>{formatMoney(depositIncrease)} đ</strong>
            </span>
          </label>
        )}

        <Field label="Ghi chú lượt thuê" hint="Tuỳ chọn — lý do tăng giá, thu cọc...">
          <TextInput value={note} onChange={setNote} placeholder="VD: Tăng giá từ tháng 10" />
        </Field>

        {preview.length > 0 && (
          <div className="hint stack tight">
            {preview.map((line) => (
              <div key={line}>• {line}</div>
            ))}
          </div>
        )}

        <button className="btn primary block" onClick={save} disabled={!canSave || saving}>
          Lưu thay đổi
        </button>
      </div>
    </Sheet>
  )
}
