import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { issueMonthlyInvoice, previewMonthly } from '../../data/actions'
import { activeTenancy, nextIssueDateFor, primaryTenant } from '../../data/selectors'
import { useDataset } from '../../data/store'
import { roomCollectsMeteredUtilities } from '../../domain/billing'
import * as dt from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { ID } from '../../domain/types'
import { Banner, Card, EmptyState, Pill, useToast } from '../../ui/components'
import { Page } from '../../ui/Page'

export function IssuePage() {
  const data = useDataset()
  const navigate = useNavigate()
  const { toast, toastNode } = useToast()
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [busy, setBusy] = useState(false)
  const now = dt.today()
  const thisPeriod = dt.periodOf(now)

  const candidates = useMemo(() => {
    return data.rooms
      .map((room) => {
        const tenancy = activeTenancy(data, room.id)
        if (!tenancy) return null
        const issueDate = nextIssueDateFor(data, tenancy, now)
        const preview = previewMonthly({ data, room, tenancy, issueDate })
        return {
          room,
          tenancy,
          issueDate,
          preview,
          tenantName: primaryTenant(data, tenancy.id)?.fullName ?? '',
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.room.name.localeCompare(b.room.name, 'vi'))
  }, [data, now])

  const due = candidates.filter((c) => c.issueDate <= now)
  const earlyInMonth = candidates.filter(
    (c) => c.issueDate > now && dt.periodOf(c.issueDate) === thisPeriod,
  )
  const issuable = [...due, ...earlyInMonth]

  const toggle = (roomId: ID) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(roomId)) next.delete(roomId)
      else next.add(roomId)
      return next
    })
  }

  const issueSelected = async () => {
    if (busy) return
    setBusy(true)
    let count = 0
    let lastId: ID | null = null
    for (const item of issuable) {
      if (!selected.has(item.room.id)) continue
      lastId = await issueMonthlyInvoice({
        data,
        room: item.room,
        tenancy: item.tenancy,
        issueDate: item.issueDate,
      })
      count += 1
    }
    setBusy(false)
    setSelected(new Set())
    if (count === 1 && lastId) navigate(`/phieu/${lastId}`)
    else if (count > 0) {
      toast(`Đã phát ${count} phiếu`)
      navigate('/phieu')
    }
  }

  const renderItem = (item: (typeof candidates)[number], options?: { early?: boolean }) => {
    const checked = selected.has(item.room.id)
    const early = options?.early ?? false
    const rentLine = item.preview.rentFrom
      ? `Tiền phòng ${dt.formatDateShort(item.preview.rentFrom)} – ${dt.formatDateShort(item.preview.rentTo!)}`
      : `Tiền phòng đã đóng tới ${dt.formatDate(item.preview.rentPaidThrough!)}`

    return (
      <button
        key={item.room.id}
        className="list-item"
        onClick={() => toggle(item.room.id)}
        style={checked ? { background: 'var(--accent-soft)' } : undefined}
      >
        <div className="row between">
          <div className="grow">
            <div className="row" style={{ gap: 8 }}>
              <span className="strong" style={{ fontSize: 16 }}>
                {item.room.name}
              </span>
              <Pill tone="accent">{dt.formatDate(item.issueDate)}</Pill>
              {early && <Pill tone="muted">phát sớm</Pill>}
              {checked && <Pill tone="ok">Đã chọn</Pill>}
            </div>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {rentLine}
            </div>
            <div className="tiny muted">
              {roomCollectsMeteredUtilities(item.room)
                ? `Điện nước kèm ${dt.formatInvoiceMonthLabel(dt.periodOf(item.issueDate))}`
                : 'Chỉ thu tiền nhà'}
            </div>
            {item.preview.lines.some((l) => l.type === 'carryOver') && (
              <div className="tiny" style={{ color: 'var(--warn)' }}>
                Có dòng nợ cũ — nên thu phiếu nhận phòng trước, tránh tạo 2 phiếu cùng ngày.
              </div>
            )}
            {item.preview.warnings.map((w) => (
              <div key={w} className="tiny" style={{ color: 'var(--warn)' }}>
                {w}
              </div>
            ))}
          </div>
          <div className="right">
            <div className="num strong">{formatMoney(item.preview.total)} đ</div>
            {item.tenantName && <div className="tiny muted">{item.tenantName}</div>}
          </div>
        </div>
      </button>
    )
  }

  return (
    <Page title="Phát phiếu" back="/phieu" subtitle={`Hôm nay ${dt.formatDate(now)}`}>
      {candidates.length === 0 ? (
        <EmptyState icon="🧾" text="Chưa có phòng nào đang có khách để phát phiếu." />
      ) : (
        <>
          <Banner tone="info">
            Phiếu phát trong tháng nào thì lấy điện nước của tháng liền trước. Có thể{' '}
            <strong>phát sớm</strong> trước mốc ngày nếu vẫn trong tháng. Tiền phòng chỉ tính khi tới
            mốc trên phiếu — khách đã đóng trước sẽ không bị thu lần hai.
          </Banner>

          <Card title={`Tới mốc phát phiếu (${due.length})`} flush>
            {due.length === 0 ? (
              <div className="muted small" style={{ padding: '0 16px 16px' }}>
                Hôm nay chưa phòng nào tới mốc.
                {earlyInMonth.length > 0 && (
                  <> Có thể phát sớm {earlyInMonth.length} phòng trong tháng bên dưới.</>
                )}
                {earlyInMonth.length === 0 && candidates.length > 0 && (
                  <>
                    {' '}
                    Mốc gần nhất:{' '}
                    {candidates
                      .filter((c) => c.issueDate > now)
                      .slice(0, 3)
                      .map((item) => `${item.room.name} (${dt.formatDate(item.issueDate)})`)
                      .join(' · ')}
                    .
                  </>
                )}
              </div>
            ) : (
              due.map((item) => renderItem(item))
            )}
          </Card>

          {earlyInMonth.length > 0 && (
            <Card title={`Phát sớm trong ${dt.formatPeriod(thisPeriod)} (${earlyInMonth.length})`} flush>
              {earlyInMonth.map((item) => renderItem(item, { early: true }))}
            </Card>
          )}

          <button
            className="btn primary block"
            onClick={issueSelected}
            disabled={selected.size === 0 || busy}
          >
            {selected.size === 0 ? 'Chọn phòng để phát phiếu' : `Phát ${selected.size} phiếu`}
          </button>
        </>
      )}

      {toastNode}
    </Page>
  )
}
