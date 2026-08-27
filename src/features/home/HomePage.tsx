import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  activeTenancy,
  nextIssueDateFor,
  primaryTenant,
  readingOf,
  totalDepositHeld,
} from '../../data/selectors'
import { useDataset } from '../../data/store'
import { cashPaidAmount, outstandingOf, ownTotal } from '../../domain/billing'
import * as dt from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import { Banner, Card, EmptyState, Pill } from '../../ui/components'
import { Page } from '../../ui/Page'

export function HomePage() {
  const data = useDataset()
  const now = dt.today()
  const thisPeriod = dt.periodOf(now)

  const stats = useMemo(() => {
    const monthInvoices = data.invoices.filter((i) => dt.periodOf(i.issueDate) === thisPeriod)
    const billed = monthInvoices.reduce((acc, i) => acc + Math.max(0, ownTotal(i)), 0)
    const collected = monthInvoices.reduce((acc, i) => acc + Math.max(0, cashPaidAmount(i)), 0)
    const outstandingAll = data.invoices.reduce((acc, i) => {
      const remaining = outstandingOf(i)
      return remaining > 0 ? acc + remaining : acc
    }, 0)
    return { billed, collected, outstandingAll }
  }, [data.invoices, thisPeriod])

  const schedule = useMemo(() => {
    return data.rooms
      .map((room) => {
        const tenancy = activeTenancy(data, room.id)
        if (!tenancy) return null
        const issueDate = nextIssueDateFor(data, tenancy, now)
        return {
          room,
          tenancy,
          issueDate,
          daysAway: dt.diffDays(now, issueDate),
          tenantName: primaryTenant(data, tenancy.id)?.fullName ?? '',
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) => item.daysAway <= 7)
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
  }, [data, now])

  const utilityPeriod = dt.prevPeriod(thisPeriod)
  const missingReadings = data.rooms.filter(
    (room) => activeTenancy(data, room.id) && !readingOf(data, room.id, utilityPeriod),
  )

  const debtors = data.rooms
    .map((room) => {
      const unpaid = data.invoices
        .filter((i) => i.roomId === room.id)
        .reduce((acc, i) => {
          const remaining = outstandingOf(i)
          return remaining > 0 ? acc + remaining : acc
        }, 0)
      return { room, unpaid }
    })
    .filter((item) => item.unpaid > 0)
    .sort((a, b) => b.unpaid - a.unpaid)

  if (data.rooms.length === 0) {
    return (
      <Page title="Quản lý nhà trọ">
        <EmptyState
          icon="🏠"
          text="Bắt đầu bằng cách khai báo các phòng trọ của bạn."
          action={
            <Link className="btn primary" to="/phong">
              Thêm phòng
            </Link>
          }
        />
      </Page>
    )
  }

  return (
    <Page title={data.settings.landlordName || 'Quản lý nhà trọ'} subtitle={dt.formatDate(now)}>
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat">
          <div className="label">Ra phiếu tháng này</div>
          <div className="value">{formatMoney(stats.billed)}</div>
        </div>
        <div className="stat">
          <div className="label">Đã thu</div>
          <div className="value" style={{ color: 'var(--ok)' }}>
            {formatMoney(stats.collected)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Còn phải thu</div>
          <div className="value" style={{ color: stats.outstandingAll > 0 ? 'var(--danger)' : undefined }}>
            {formatMoney(stats.outstandingAll)}
          </div>
        </div>
      </div>

      {missingReadings.length > 0 && (
        <Banner tone="warn">
          Còn {missingReadings.length} phòng chưa có chỉ số {dt.formatPeriod(utilityPeriod)}:{' '}
          {missingReadings.map((r) => r.name).join(', ')}.{' '}
          <Link to="/chi-so" style={{ color: 'inherit', fontWeight: 700 }}>
            Nhập ngay
          </Link>
        </Banner>
      )}

      <Card title="Lịch phát phiếu 7 ngày tới" flush>
        {schedule.length === 0 ? (
          <div className="muted small" style={{ padding: '0 16px 16px' }}>
            Không có phòng nào tới mốc trong tuần này.
          </div>
        ) : (
          schedule.map((item) => (
            <Link className="list-item" key={item.room.id} to="/phat-phieu">
              <div className="row between">
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="strong">{item.room.name}</span>
                    {item.daysAway <= 0 ? (
                      <Pill tone="danger">Tới mốc</Pill>
                    ) : (
                      <Pill tone="muted">còn {item.daysAway} ngày</Pill>
                    )}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 3 }}>
                    {item.tenantName || 'Chưa có tên'} · mốc ngày {item.tenancy.cycleDay}
                  </div>
                </div>
                <div className="right small">{dt.formatDate(item.issueDate)}</div>
              </div>
            </Link>
          ))
        )}
      </Card>

      {debtors.length > 0 && (
        <Card title="Phòng còn nợ" flush>
          {debtors.map(({ room, unpaid }) => (
            <Link className="list-item" key={room.id} to={`/phong/${room.id}`}>
              <div className="row between">
                <span className="strong">{room.name}</span>
                <span className="num" style={{ color: 'var(--danger)' }}>
                  {formatMoney(unpaid)} đ
                </span>
              </div>
            </Link>
          ))}
        </Card>
      )}

      <Card title="Đang giữ của khách">
        <div className="row between">
          <span className="muted small">Tổng tiền cọc các phòng đang ở</span>
          <span className="num strong">{formatMoney(totalDepositHeld(data))} đ</span>
        </div>
      </Card>

      <div className="row" style={{ gap: 10 }}>
        <Link className="btn grow" to="/chi-so">
          Nhập chỉ số
        </Link>
        <Link className="btn primary grow" to="/phat-phieu">
          Phát phiếu
        </Link>
      </div>
      <div style={{ marginTop: 10 }}>
        <Link className="btn block" to="/bao-cao">
          Xem báo cáo
        </Link>
      </div>
    </Page>
  )
}
