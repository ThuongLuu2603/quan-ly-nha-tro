import { useMemo, useState } from 'react'
import { totalDepositHeld } from '../../data/selectors'
import { useDataset } from '../../data/store'
import { cashPaidAmount, outstandingOf, ownTotal, paidAmount } from '../../domain/billing'
import * as dt from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import { downloadBlob } from '../../receipt/share'
import { Card, EmptyState } from '../../ui/components'
import { Page } from '../../ui/Page'

export function ReportsPage() {
  const data = useDataset()
  const [year, setYear] = useState(() => Number(dt.today().slice(0, 4)))

  const roomName = useMemo(() => new Map(data.rooms.map((r) => [r.id, r.name])), [data.rooms])

  const months = useMemo(() => {
    return dt.periodRange(`${year}-01`, `${year}-12`).map((period) => {
      const invoices = data.invoices.filter((i) => dt.periodOf(i.issueDate) === period)
      const billed = invoices.reduce((acc, i) => acc + Math.max(0, ownTotal(i)), 0)
      const collected = invoices.reduce((acc, i) => acc + Math.max(0, cashPaidAmount(i)), 0)
      return { period, billed, collected, count: invoices.length }
    })
  }, [data.invoices, year])

  const yearTotal = months.reduce(
    (acc, m) => ({ billed: acc.billed + m.billed, collected: acc.collected + m.collected }),
    { billed: 0, collected: 0 },
  )

  const debts = data.invoices
    .map((invoice) => ({ invoice, remaining: outstandingOf(invoice) }))
    .filter((item) => item.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)

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
        <div className="stack tight">
          {months
            .filter((m) => m.count > 0)
            .map((month) => (
              <div className="row between" key={month.period}>
                <span className="small">{dt.formatPeriod(month.period)}</span>
                <span className="num small">
                  {formatMoney(month.billed)} đ
                  <span className="muted"> · thu {formatMoney(month.collected)} đ</span>
                </span>
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
