import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { invoiceStatusLabel } from '../../data/selectors'
import { useDataset } from '../../data/store'
import { outstandingOf, statusOf } from '../../domain/billing'
import * as dt from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import { Card, EmptyState, Pill } from '../../ui/components'
import { Page } from '../../ui/Page'

type Filter = 'all' | 'unpaid' | 'unsent'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'unpaid', label: 'Chưa thu xong' },
  { value: 'unsent', label: 'Chưa gửi' },
  { value: 'all', label: 'Tất cả' },
]

export function InvoiceListPage() {
  const data = useDataset()
  const [filter, setFilter] = useState<Filter>('unpaid')

  const roomName = useMemo(
    () => new Map(data.rooms.map((r) => [r.id, r.name])),
    [data.rooms],
  )

  const invoices = data.invoices.filter((invoice) => {
    if (filter === 'unpaid') return statusOf(invoice) !== 'paid'
    if (filter === 'unsent') return !invoice.sentAt
    return true
  })

  const totalOutstanding = data.invoices.reduce((acc, invoice) => {
    const remaining = outstandingOf(invoice)
    return remaining > 0 ? acc + remaining : acc
  }, 0)

  return (
    <Page title="Phiếu" subtitle={totalOutstanding > 0 ? `Còn phải thu ${formatMoney(totalOutstanding)} đ` : 'Đã thu đủ'}>
      <div className="chip-row">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            className={filter === item.value ? 'chip active' : 'chip'}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon="🧾"
          text={filter === 'all' ? 'Chưa có phiếu nào.' : 'Không có phiếu nào ở mục này.'}
          action={
            <Link className="btn primary" to="/phat-phieu">
              Phát phiếu
            </Link>
          }
        />
      ) : (
        <Card flush>
          {invoices.map((invoice) => {
            const remaining = outstandingOf(invoice)
            const status = statusOf(invoice)
            return (
              <Link className="list-item" key={invoice.id} to={`/phieu/${invoice.id}`}>
                <div className="row between">
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="strong" style={{ fontSize: 16 }}>
                        {roomName.get(invoice.roomId) ?? 'Phòng đã xoá'}
                      </span>
                      {invoice.kind === 'moveIn' && <Pill tone="accent">Nhận phòng</Pill>}
                      {invoice.kind === 'checkout' && <Pill tone="warn">Tất toán</Pill>}
                      {!invoice.sentAt && <Pill tone="muted">Chưa gửi</Pill>}
                    </div>
                    <div className="tiny muted" style={{ marginTop: 3 }}>
                      {dt.formatDate(invoice.issueDate)} · {invoiceStatusLabel(invoice)}
                    </div>
                  </div>
                  <div className="right">
                    <div className="num strong">{formatMoney(Math.abs(invoice.total))} đ</div>
                    {status !== 'paid' && Math.abs(remaining) >= 1 && (
                      <div className="tiny" style={{ color: 'var(--danger)' }}>
                        còn {formatMoney(Math.abs(remaining))} đ
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </Card>
      )}

      <Link className="fab" to="/phat-phieu">
        + Phát phiếu
      </Link>
    </Page>
  )
}
