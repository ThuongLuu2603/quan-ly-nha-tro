import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { checkout, previewCheckout } from '../../data/actions'
import { activeTenancy, tenantsOf } from '../../data/selectors'
import { useDataset } from '../../data/store'
import * as dt from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import {
  Banner,
  Card,
  DateInput,
  EmptyState,
  Field,
  MoneyInput,
  NumberInput,
  TextInput,
} from '../../ui/components'
import { Page } from '../../ui/Page'

interface Deduction {
  label: string
  amount: number
}

export function CheckoutPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const data = useDataset()
  const room = data.rooms.find((r) => r.id === roomId)
  const tenancy = room ? activeTenancy(data, room.id) : undefined

  const [checkoutDate, setCheckoutDate] = useState(dt.today())
  const [finalElectric, setFinalElectric] = useState<number | null>(null)
  const [finalWater, setFinalWater] = useState<number | null>(null)
  const [deductions, setDeductions] = useState<Deduction[]>([])
  const [saving, setSaving] = useState(false)

  const preview = useMemo(() => {
    if (!room || !tenancy) return null
    return previewCheckout({
      data,
      room,
      tenancy,
      checkoutDate,
      finalElectric: finalElectric ?? tenancy.electricStart,
      finalWater: finalWater ?? tenancy.waterStart,
      deductions: deductions.filter((d) => d.amount !== 0),
    })
  }, [data, room, tenancy, checkoutDate, finalElectric, finalWater, deductions])

  if (!room) {
    return (
      <Page title="Trả phòng" back="/phong">
        <EmptyState icon="🔍" text="Không tìm thấy phòng này." />
      </Page>
    )
  }

  if (!tenancy) {
    return (
      <Page title="Trả phòng" back={`/phong/${room.id}`}>
        <Banner tone="warn">Phòng {room.name} đang trống, không có gì để tất toán.</Banner>
      </Page>
    )
  }

  const occupants = tenantsOf(data, tenancy.id)
  const ready = finalElectric !== null && finalWater !== null && !saving
  const refundToTenant = preview ? -preview.total : 0

  const submit = async () => {
    if (!ready || !preview) return
    const message =
      refundToTenant > 0
        ? `Trả lại khách ${formatMoney(refundToTenant)} đ và đóng lượt thuê?`
        : `Khách phải bù thêm ${formatMoney(-refundToTenant)} đ. Xác nhận trả phòng?`
    if (!window.confirm(message)) return

    setSaving(true)
    const invoiceId = await checkout({
      data,
      room,
      tenancy,
      checkoutDate,
      finalElectric: finalElectric ?? 0,
      finalWater: finalWater ?? 0,
      deductions: deductions.filter((d) => d.amount !== 0),
    })
    navigate(`/phieu/${invoiceId}`, { replace: true })
  }

  return (
    <Page title={`Trả phòng ${room.name}`} back={`/phong/${room.id}`}>
      <Card title="Thông tin trả phòng">
        <div className="stack">
          <div className="small muted">
            {occupants.map((t) => t.fullName).join(', ') || 'Chưa có tên người ở'} · vào ở từ{' '}
            {dt.formatDate(tenancy.startDate)}
          </div>

          <Field label="Ngày trả phòng">
            <DateInput value={checkoutDate} onChange={setCheckoutDate} />
          </Field>

          <div className="grid-2">
            <Field label="Chỉ số điện chốt" hint={`Bàn giao ${tenancy.electricStart}`}>
              <NumberInput
                value={finalElectric}
                onChange={setFinalElectric}
                placeholder="Số trên đồng hồ"
                invalid={finalElectric !== null && finalElectric < tenancy.electricStart}
              />
            </Field>
            <Field label="Chỉ số nước chốt" hint={`Bàn giao ${tenancy.waterStart}`}>
              <NumberInput
                value={finalWater}
                onChange={setFinalWater}
                placeholder="Số trên đồng hồ"
                invalid={finalWater !== null && finalWater < tenancy.waterStart}
              />
            </Field>
          </div>

          <div className="small muted">
            Điện nước kỳ cuối chốt ngay tại ngày trả phòng, không đợi hết tháng.
          </div>
        </div>
      </Card>

      <Card
        title="Khoản trừ thêm"
        action={
          <button
            className="btn ghost"
            onClick={() => setDeductions((prev) => [...prev, { label: '', amount: 0 }])}
          >
            + Thêm
          </button>
        }
      >
        {deductions.length === 0 ? (
          <div className="muted small">Hỏng hóc, mất chìa khoá, phạt hợp đồng... nếu có.</div>
        ) : (
          <div className="stack tight">
            {deductions.map((item, index) => (
              <div className="row" key={index}>
                <div className="grow">
                  <TextInput
                    value={item.label}
                    onChange={(value) =>
                      setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, label: value } : d)))
                    }
                    placeholder="Hỏng khoá cửa"
                  />
                </div>
                <div style={{ width: 130 }}>
                  <MoneyInput
                    value={item.amount}
                    onChange={(value) =>
                      setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, amount: value } : d)))
                    }
                  />
                </div>
                <button
                  className="btn ghost"
                  onClick={() => setDeductions((prev) => prev.filter((_, i) => i !== index))}
                >
                  Xoá
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {preview && (
        <Card title="Bảng tất toán">
          {preview.warnings.map((warning) => (
            <Banner tone="warn" key={warning}>
              {warning}
            </Banner>
          ))}

          {preview.lines.length === 0 ? (
            <div className="muted small">Nhập chỉ số công tơ để xem bảng tất toán.</div>
          ) : (
            preview.lines.map((line) => (
              <div className="line-row" key={line.id}>
                <div className="grow">
                  <div>{line.label}</div>
                  {line.detail && <div className="tiny muted">{line.detail}</div>}
                </div>
                <div className="num">{formatMoney(line.amount)} đ</div>
              </div>
            ))
          )}

          <div className="total-row">
            <span>{refundToTenant >= 0 ? 'Trả lại khách' : 'Khách bù thêm'}</span>
            <span className="num" style={{ color: refundToTenant >= 0 ? 'var(--warn)' : 'var(--ink)' }}>
              {formatMoney(Math.abs(refundToTenant))} đ
            </span>
          </div>

          {preview.refundDays > 0 && (
            <div className="small muted" style={{ marginTop: 10 }}>
              Đã hoàn {preview.refundDays} ngày tiền phòng chưa ở, do khách đóng tới ngày{' '}
              {dt.formatDate(tenancy.rentPaidThrough)}.
            </div>
          )}
        </Card>
      )}

      <button className="btn primary block" onClick={submit} disabled={!ready}>
        Xác nhận trả phòng
      </button>
      <div className="small muted center" style={{ marginTop: 10 }}>
        Chỉ số chốt hôm nay sẽ thành chỉ số bàn giao cho khách kế tiếp.
      </div>
    </Page>
  )
}
