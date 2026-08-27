import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { moveIn } from '../../data/actions'
import { activeTenancy } from '../../data/selectors'
import { useDataset } from '../../data/store'
import { buildMoveInInvoice } from '../../domain/billing'
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
  Select,
  TextInput,
} from '../../ui/components'
import { Page } from '../../ui/Page'

const CYCLE_DAYS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `Ngày ${i + 1}` }))

interface DraftTenant {
  fullName: string
  phone: string
}

export function MoveInPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const data = useDataset()
  const room = data.rooms.find((r) => r.id === roomId)

  const [startDate, setStartDate] = useState(dt.today())
  const [cycleDay, setCycleDay] = useState(room?.defaultCycleDay ?? 1)
  const [rent, setRent] = useState(room?.defaultRent ?? 0)
  const [deposit, setDeposit] = useState(room?.defaultDeposit ?? 0)
  const [electricStart, setElectricStart] = useState<number | null>(0)
  const [waterStart, setWaterStart] = useState<number | null>(0)
  const [collectFirstCycle, setCollectFirstCycle] = useState(true)
  const [daysOverride, setDaysOverride] = useState<number | null>(null)
  const [tenants, setTenants] = useState<DraftTenant[]>([{ fullName: '', phone: '' }])
  const [saving, setSaving] = useState(false)

  const preview = useMemo(
    () =>
      buildMoveInInvoice({
        rent,
        deposit,
        cycleDay,
        moveInDate: startDate,
        collectFirstCycle,
        proratedDaysOverride: daysOverride ?? undefined,
      }),
    [rent, deposit, cycleDay, startDate, collectFirstCycle, daysOverride],
  )

  if (!room) {
    return (
      <Page title="Nhận phòng" back="/phong">
        <EmptyState icon="🔍" text="Không tìm thấy phòng này." />
      </Page>
    )
  }

  const existing = activeTenancy(data, room.id)
  if (existing) {
    return (
      <Page title="Nhận phòng" back={`/phong/${room.id}`}>
        <Banner tone="warn">
          Phòng {room.name} đang có khách ở. Cần làm thủ tục trả phòng trước khi nhận khách mới.
        </Banner>
      </Page>
    )
  }

  const autoDays = dt.diffDays(startDate, preview.firstCycleStart)
  const canSave = tenants.some((t) => t.fullName.trim()) && rent > 0 && !saving

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    const invoiceId = await moveIn({
      roomId: room.id,
      roomName: room.name,
      startDate,
      cycleDay,
      rent,
      deposit,
      electricStart: electricStart ?? 0,
      waterStart: waterStart ?? 0,
      collectFirstCycle,
      proratedDaysOverride: daysOverride ?? undefined,
      tenants: tenants
        .filter((t) => t.fullName.trim())
        .map((t, index) => ({ fullName: t.fullName, phone: t.phone, isPrimary: index === 0 })),
    })
    navigate(`/phieu/${invoiceId}`, { replace: true })
  }

  return (
    <Page title={`Nhận phòng ${room.name}`} back={`/phong/${room.id}`}>
      <Card title="Thông tin thuê">
        <div className="stack">
          <div className="grid-2">
            <Field label="Ngày dọn vào">
              <DateInput value={startDate} onChange={setStartDate} />
            </Field>
            <Field label="Mốc ngày">
              <Select value={cycleDay} onChange={setCycleDay} options={CYCLE_DAYS} />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Giá thuê / tháng">
              <MoneyInput value={rent} onChange={setRent} />
            </Field>
            <Field label="Tiền cọc">
              <MoneyInput value={deposit} onChange={setDeposit} />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Chỉ số điện bàn giao">
              <NumberInput value={electricStart} onChange={setElectricStart} />
            </Field>
            <Field label="Chỉ số nước bàn giao">
              <NumberInput value={waterStart} onChange={setWaterStart} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Người lưu trú">
        <div className="stack tight">
          {tenants.map((tenant, index) => (
            <div className="stack tight" key={index}>
              <div className="row">
                <div className="grow">
                  <TextInput
                    value={tenant.fullName}
                    onChange={(value) =>
                      setTenants((prev) => prev.map((t, i) => (i === index ? { ...t, fullName: value } : t)))
                    }
                    placeholder={index === 0 ? 'Người đại diện' : 'Người ở cùng'}
                  />
                </div>
                {tenants.length > 1 && (
                  <button
                    className="btn ghost"
                    onClick={() => setTenants((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Xoá
                  </button>
                )}
              </div>
              {index === 0 && (
                <TextInput
                  value={tenant.phone}
                  onChange={(value) =>
                    setTenants((prev) => prev.map((t, i) => (i === index ? { ...t, phone: value } : t)))
                  }
                  inputMode="tel"
                  placeholder="Số điện thoại người đại diện"
                />
              )}
            </div>
          ))}
          <button
            className="btn sm"
            onClick={() => setTenants((prev) => [...prev, { fullName: '', phone: '' }])}
          >
            + Thêm người ở cùng
          </button>
        </div>
      </Card>

      <Card title="Cách thu kỳ đầu">
        <div className="stack">
          <div className="small muted">
            Mốc kế tiếp sau ngày dọn vào là {dt.formatDate(preview.firstCycleStart)}. Tiền lẻ tính từ ngày
            dọn vào tới mốc đó, sau đó là một kỳ tròn.
          </div>

          {autoDays > 0 && (
            <Field
              label="Số ngày lẻ"
              hint={`App tự đếm ${autoDays} ngày. Sửa lại nếu bạn quen tính khác.`}
            >
              <NumberInput
                value={daysOverride ?? autoDays}
                onChange={(value) => setDaysOverride(value === autoDays ? null : value)}
              />
            </Field>
          )}

          <label className="row" style={{ gap: 10 }}>
            <input
              type="checkbox"
              checked={collectFirstCycle}
              onChange={(e) => setCollectFirstCycle(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <span className="small">
              Thu luôn tiền phòng kỳ tròn đầu tiên{' '}
              {preview.rentTo &&
                `(${dt.formatDate(preview.firstCycleStart)} – ${dt.formatDate(preview.rentTo)})`}
            </span>
          </label>
        </div>
      </Card>

      <Card title="Phiếu nhận phòng sẽ tạo">
        {preview.lines.map((line) => (
          <div className="line-row" key={line.id}>
            <div className="grow">
              <div>{line.label}</div>
              {line.detail && <div className="tiny muted">{line.detail}</div>}
            </div>
            <div className="num">{formatMoney(line.amount)} đ</div>
          </div>
        ))}
        <div className="total-row">
          <span>Tổng thu</span>
          <span className="num">{formatMoney(preview.total)} đ</span>
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>
          Sau phiếu này, tiền phòng được tính là đã đóng tới ngày{' '}
          {dt.formatDate(preview.rentPaidThrough)}.
        </div>
      </Card>

      <button className="btn primary block" onClick={submit} disabled={!canSave}>
        Tạo lượt thuê và xuất phiếu
      </button>
    </Page>
  )
}
