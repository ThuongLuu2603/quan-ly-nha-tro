import { useMemo, useState } from 'react'
import { totalDepositHeld } from '../../data/selectors'
import { useDataset } from '../../data/store'
import {
  cashPaidAmount,
  outstandingOf,
  ownTotal,
  paidAmount,
  revenueBreakdownFromInvoices,
  revenueBreakdownTotal,
  type RevenueBreakdown,
} from '../../domain/billing'
import * as dt from '../../domain/dates'
import { buildRoomById, compareInvoicesByRoom } from '../../domain/roomOrder'
import { formatMoney, formatNumber } from '../../domain/money'
import { downloadBlob } from '../../receipt/share'
import { Card, EmptyState } from '../../ui/components'
import { Page } from '../../ui/Page'
import type { Invoice, Period } from '../../domain/types'

function BreakdownRows({ breakdown, compact }: { breakdown: RevenueBreakdown; compact?: boolean }) {
  const rows = [
    { label: 'Tiền trọ', amount: breakdown.rent },
    { label: 'Tiền điện', amount: breakdown.electric },
    { label: 'Tiền nước', amount: breakdown.water },
    { label: 'Tiền rác', amount: breakdown.garbage },
  ].filter((row) => row.amount !== 0)

  const extras = [
    breakdown.deposit !== 0 ? { label: 'Tiền cọc', amount: breakdown.deposit } : null,
    breakdown.other !== 0 ? { label: 'Khác', amount: breakdown.other } : null,
  ].filter((row): row is { label: string; amount: number } => row !== null)

  if (rows.length === 0 && extras.length === 0) {
    return <div className="muted small">Chưa có khoản nào trong kỳ này.</div>
  }

  if (compact) {
    const parts = [...rows, ...extras].map((row) => `${row.label} ${formatMoney(row.amount)}`)
    return <div className="tiny muted">{parts.join(' · ')}</div>
  }

  return (
    <div className="stack tight">
      {rows.map((row) => (
        <div className="row between" key={row.label}>
          <span className="muted small">{row.label}</span>
          <span className="num small">{formatMoney(row.amount)} đ</span>
        </div>
      ))}
      {extras.map((row) => (
        <div className="row between" key={row.label}>
          <span className="muted small">{row.label}</span>
          <span className="num small">{formatMoney(row.amount)} đ</span>
        </div>
      ))}
      <div className="row between" style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
        <span className="small strong">Tổng</span>
        <span className="num strong">{formatMoney(revenueBreakdownTotal(breakdown))} đ</span>
      </div>
    </div>
  )
}

interface MonthStat {
  period: Period
  invoices: Invoice[]
  count: number
  billed: number
  collected: number
  breakdown: RevenueBreakdown
  kwh: number
  m3: number
  debt: number
}

function usageKwhOf(invoices: Invoice[]): number {
  let kwh = 0
  for (const invoice of invoices) {
    for (const lineItem of invoice.lines) {
      if (lineItem.type !== 'electric') continue
      const qty = lineItem.qty > 0 ? lineItem.qty : 0
      kwh += qty
    }
  }
  return Math.round(kwh)
}

function usageM3Of(invoices: Invoice[]): number {
  let m3 = 0
  for (const invoice of invoices) {
    for (const lineItem of invoice.lines) {
      if (lineItem.type !== 'water') continue
      const qty = lineItem.qty > 0 ? lineItem.qty : 0
      m3 += qty
    }
  }
  return Math.round(m3)
}

/** Biểu đồ cột SVG doanh thu theo tháng — không cần thư viện ngoài. */
function RevenueChart({ months, year }: { months: MonthStat[]; year: number }) {
  const maxValue = Math.max(...months.map((m) => Math.max(m.billed, m.collected)), 1)
  const current = dt.periodOf(dt.today())
  const W = 720
  const H = 190
  const PAD_L = 4
  const PAD_B = 26
  const barArea = H - PAD_B
  const slot = W / months.length
  const barW = Math.min(18, slot * 0.52)
  const gap = Math.min(6, slot * 0.14)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="revenue-chart" role="img" aria-label={`Doanh thu năm ${year}`}>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={PAD_L}
          x2={W - PAD_L}
          y1={barArea * (1 - t) + 4}
          y2={barArea * (1 - t) + 4}
          stroke="var(--border)"
          strokeDasharray="3 5"
          strokeWidth="1"
        />
      ))}
      {months.map((m, index) => {
        const x = PAD_L + index * slot + (slot - barW * 2 - gap) / 2
        const bh = (v: number) => Math.max(0, (v / maxValue) * (barArea - 8))
        const billedH = bh(m.billed)
        const collectedH = bh(m.collected)
        const isActive = m.period === current
        const hasData = m.count > 0
        return (
          <g key={m.period}>
            {hasData && m.billed > 0 && (
              <rect x={x} y={barArea - billedH + 4} width={barW} height={billedH} rx={3} fill="var(--accent)" opacity={0.35} />
            )}
            {hasData && m.collected > 0 && (
              <rect x={x + barW + gap} y={barArea - collectedH + 4} width={barW} height={collectedH} rx={3} fill="var(--accent)" />
            )}
            <text
              x={x + barW + gap / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="10.5"
              fontWeight={isActive ? 700 : 500}
              fill={isActive ? 'var(--accent)' : 'var(--muted)'}
            >
              {Number(m.period.slice(5, 7))}
            </text>
          </g>
        )
      })}
      </svg>
  )
}

export function ReportsPage() {
  const data = useDataset()
  const [year, setYear] = useState(() => Number(dt.today().slice(0, 4)))
  const [openMonth, setOpenMonth] = useState<Period | null>(null)

  const roomName = useMemo(() => new Map(data.rooms.map((r) => [r.id, r.name])), [data.rooms])
  const roomById = useMemo(() => buildRoomById(data.rooms), [data.rooms])

  const yearInvoices = useMemo(
    () => data.invoices.filter((i) => i.issueDate.startsWith(String(year))),
    [data.invoices, year],
  )

  const months = useMemo<MonthStat[]>(() => {
    return dt.periodRange(`${year}-01`, `${year}-12`).map((period) => {
      const invoices = data.invoices.filter((i) => dt.periodOf(i.issueDate) === period)
      const billed = invoices.reduce((acc, i) => acc + Math.max(0, ownTotal(i)), 0)
      const collected = invoices.reduce((acc, i) => acc + Math.max(0, cashPaidAmount(i)), 0)
      const debt = invoices.reduce((acc, i) => {
        const remaining = outstandingOf(i)
        return remaining > 0 ? acc + remaining : acc
      }, 0)
      return {
        period,
        invoices,
        count: invoices.length,
        billed,
        collected,
        breakdown: revenueBreakdownFromInvoices(invoices),
        kwh: usageKwhOf(invoices),
        m3: usageM3Of(invoices),
        debt,
      }
    })
  }, [data.invoices, year])

  const yearBreakdown = useMemo(() => revenueBreakdownFromInvoices(yearInvoices), [yearInvoices])

  const yearTotal = months.reduce(
    (acc, m) => ({ billed: acc.billed + m.billed, collected: acc.collected + m.collected }),
    { billed: 0, collected: 0 },
  )

  const collectionRate = yearTotal.billed > 0 ? Math.round((yearTotal.collected / yearTotal.billed) * 100) : 0

  const kwhYear = months.reduce((acc, m) => acc + m.kwh, 0)
  const m3Year = months.reduce((acc, m) => acc + m.m3, 0)

  const best = useMemo(() => {
    const withData = months.filter((m) => m.billed > 0)
    if (withData.length === 0) return undefined
    return withData.reduce((acc, m) => (m.billed > acc.billed ? m : acc))
  }, [months])

  const occupancy = useMemo(() => {
    const occupied = data.rooms.filter((room) => data.tenancies.some((t) => t.roomId === room.id && t.status === 'active'))
    const rate = data.rooms.length > 0 ? Math.round((occupied.length / data.rooms.length) * 100) : 0
    return { occupied, rate }
  }, [data.rooms, data.tenancies])

  const debts = data.invoices
    .map((invoice) => ({ invoice, remaining: outstandingOf(invoice) }))
    .filter((item) => item.remaining > 0)
    .sort((a, b) => compareInvoicesByRoom(a.invoice, b.invoice, roomById, 'desc'))

  const years = useMemo(() => {
    const set = new Set<number>([Number(dt.today().slice(0, 4))])
    for (const invoice of data.invoices) set.add(Number(invoice.issueDate.slice(0, 4)))
    return [...set].sort((a, b) => b - a)
  }, [data.invoices])

  const exportCsv = () => {
    const header = ['Ma phieu', 'Phong', 'Ngay lap', 'Loai', 'Tong', 'Da thu', 'Con lai']
    const rows = data.invoices.map((invoice) => [
      invoice.code,
      roomName.get(invoice.roomId) ?? '',
      invoice.issueDate,
      invoice.kind,
      String(invoice.total),
      String(paidAmount(invoice)),
      String(outstandingOf(invoice)),
    ])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\r\n')
    downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), `phieu-nha-tro-${year}.csv`)
  }

  if (data.invoices.length === 0) {
    return (
      <Page title="Báo cáo" back="/">
        <EmptyState icon="report" text="Chưa có phiếu nào để thống kê." />
      </Page>
    )
  }

  return (
    <Page title="Báo cáo" back="/">
      <div className="chip-row">
        {years.map((y) => (
          <button key={y} className={y === year ? 'chip active' : 'chip'} onClick={() => setYear(y)}>
            Năm {y}
          </button>
        ))}
      </div>

      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat">
          <div className="label">Ra phiếu {year}</div>
          <div className="value">{formatMoney(yearTotal.billed)}</div>
        </div>
        <div className="stat">
          <div className="label">Đã thu</div>
          <div className="value" style={{ color: 'var(--ok)' }}>
            {formatMoney(yearTotal.collected)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Tỷ lệ thu</div>
          <div className="value" style={{ color: collectionRate >= 95 ? 'var(--ok)' : collectionRate >= 80 ? 'var(--warn)' : 'var(--danger)' }}>
            {collectionRate}%
          </div>
        </div>
      </div>

      <Card title={`Biểu đồ doanh thu ${year}`}>
        <div className="chart-legend tiny muted">
          <span><i className="dot billed" /> Ra phiếu</span>
          <span><i className="dot collected" /> Đã thu</span>
        </div>
        <RevenueChart months={months} year={year} />
      </Card>

      <Card title={`Tổng kết năm ${year}`}>
        <BreakdownRows breakdown={yearBreakdown} />
      </Card>

      <Card title={`Điện nước năm ${year}`}>
        <div className="row between">
          <span className="muted small">Điện tiêu thụ</span>
          <span className="num strong">{formatNumber(kwhYear)} kWh</span>
        </div>
        <div className="row between" style={{ marginTop: 6 }}>
          <span className="muted small">Nước tiêu thụ</span>
          <span className="num strong">{formatNumber(m3Year)} m³</span>
        </div>
      </Card>

      <Card title={`Theo tháng · bấm để xem chi tiết`}>
        <div className="stack">
          {months
            .filter((m) => m.count > 0)
            .map((month) => {
              const open = openMonth === month.period
              const rate = month.billed > 0 ? Math.round((month.collected / month.billed) * 100) : 100
              return (
                <div key={month.period} style={{ paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
                  <button
                    type="button"
                    className="row between month-row"
                    onClick={() => setOpenMonth(open ? null : month.period)}
                  >
                    <span className="small strong">{dt.formatPeriod(month.period)}</span>
                    <span className="num small">
                      {formatMoney(month.billed)} đ
                      <span className="muted"> · thu {rate}%</span>
                      <span className="month-caret">{open ? '▾' : '▸'}</span>
                    </span>
                  </button>
                  {open ? (
                    <div className="stack tight" style={{ marginTop: 10 }}>
                      <div className="row between small">
                        <span className="muted">Đã thu</span>
                        <span className="num" style={{ color: 'var(--ok)' }}>{formatMoney(month.collected)} đ</span>
                      </div>
                      {month.debt > 0 && (
                        <div className="row between small">
                          <span className="muted">Còn nợ từ phiếu tháng này</span>
                          <span className="num" style={{ color: 'var(--danger)' }}>{formatMoney(month.debt)} đ</span>
                        </div>
                      )}
                      {month.kwh > 0 && (
                        <div className="row between small">
                          <span className="muted">Điện</span>
                          <span className="num">{formatNumber(month.kwh)} kWh</span>
                        </div>
                      )}
                      {month.m3 > 0 && (
                        <div className="row between small">
                          <span className="muted">Nước</span>
                          <span className="num">{formatNumber(month.m3)} m³</span>
                        </div>
                      )}
                      <BreakdownRows breakdown={month.breakdown} />
                    </div>
                  ) : (
                    <BreakdownRows breakdown={month.breakdown} compact />
                  )}
                </div>
              )
            })}
        </div>
      </Card>

      <Card title="Hiện trạng phòng">
        <div className="row between small">
          <span className="muted">Đang có khách</span>
          <span className="num strong">{occupancy.occupied.length}/{data.rooms.length} · {occupancy.rate}%</span>
        </div>
        <div className="row between" style={{ marginTop: 6 }}>
          <span className="muted small">Tiền cọc đang giữ</span>
          <span className="num">{formatMoney(totalDepositHeld(data))} đ</span>
        </div>
        {best && (
          <div className="row between" style={{ marginTop: 6 }}>
            <span className="muted small">Tháng ra phiếu cao nhất</span>
            <span className="num small">{dt.formatPeriod(best.period)} · {formatMoney(best.billed)} đ</span>
          </div>
        )}
      </Card>

      <Card title={`Phiếu còn nợ (${debts.length})`}>
        {debts.length === 0 ? (
          <div className="muted small">Không còn khoản nào chưa thu.</div>
        ) : (
          <div className="stack tight">
            {debts.map(({ invoice, remaining }) => (
              <div className="row between" key={invoice.id}>
                <span className="small">
                  {roomName.get(invoice.roomId)} · {dt.formatDate(invoice.issueDate)}
                </span>
                <span className="num small" style={{ color: 'var(--danger)' }}>
                  {formatMoney(remaining)} đ
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <button className="btn block" onClick={exportCsv}>
        Xuất CSV mở bằng Excel
      </button>
    </Page>
  )
}
