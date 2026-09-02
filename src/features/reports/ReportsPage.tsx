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
import { formatMoney } from '../../domain/money'
import { downloadBlob } from '../../receipt/share'
import { Card, EmptyState } from '../../ui/components'
import { Page } from '../../ui/Page'

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

export function ReportsPage() {
  const data = useDataset()
  const [year, setYear] = useState(() => Number(dt.today().slice(0, 4)))

  const roomName = useMemo(() => new Map(data.rooms.map((r) => [r.id, r.name])), [data.rooms])
  const roomById = useMemo(() => buildRoomById(data.rooms), [data.rooms])

  const yearInvoices = useMemo(
    () => data.invoices.filter((i) => i.issueDate.startsWith(String(year))),
    [data.invoices, year],
  )

  const months = useMemo(() => {
    return dt.periodRange(`${year}-01`, `${year}-12`).map((period) => {
      const invoices = data.invoices.filter((i) => dt.periodOf(i.issueDate) === period)
      const billed = invoices.reduce((acc, i) => acc + Math.max(0, ownTotal(i)), 0)
      const collected = invoices.reduce((acc, i) => acc + Math.max(0, cashPaidAmount(i)), 0)
      const breakdown = revenueBreakdownFromInvoices(invoices)
      return { period, billed, collected, count: invoices.length, breakdown }
    })
  }, [data.invoices, year])

  const yearBreakdown = useMemo(() => revenueBreakdownFromInvoices(yearInvoices), [yearInvoices])

  const yearTotal = months.reduce(
    (acc, m) => ({ billed: acc.billed + m.billed, collected: acc.collected + m.collected }),
    { billed: 0, collected: 0 },
  )

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
        <EmptyState icon="📊" text="Chưa có phiếu nào để thống kê." />
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

      <Card title={`Tổng kết năm ${year}`}>
        <BreakdownRows breakdown={yearBreakdown} />
      </Card>

      <Card title={`Doanh thu năm ${year}`}>
        <div className="stack tight">
          <div className="row between">
            <span className="muted small">Tổng ra phiếu</span>
            <span className="num strong">{formatMoney(yearTotal.billed)} đ</span>
          </div>
          <div className="row between">
            <span className="muted small">Đã thu</span>
            <span className="num strong" style={{ color: 'var(--ok)' }}>
              {formatMoney(yearTotal.collected)} đ
            </span>
          </div>
          <div className="row between">
            <span className="muted small">Tiền cọc đang giữ</span>
            <span className="num">{formatMoney(totalDepositHeld(data))} đ</span>
          </div>
        </div>
      </Card>

      <Card title="Theo tháng">
        <div className="stack">
          {months
            .filter((m) => m.count > 0)
            .map((month) => (
              <div className="stack tight" key={month.period} style={{ paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
                <div className="row between">
                  <span className="small strong">{dt.formatPeriod(month.period)}</span>
                  <span className="num small">
                    {formatMoney(month.billed)} đ
                    <span className="muted"> · thu {formatMoney(month.collected)} đ</span>
                  </span>
                </div>
                <BreakdownRows breakdown={month.breakdown} compact />
              </div>
            ))}
        </div>
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
