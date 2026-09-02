import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { invoiceStatusLabel, invoiceAbsorbedBy } from '../../data/selectors'
import { useDataset } from '../../data/store'
import { outstandingOf, statusOf, wasCarriedForward } from '../../domain/billing'
import * as dt from '../../domain/dates'
import { buildRoomById, compareInvoicesByRoom } from '../../domain/roomOrder'
import type { Period } from '../../domain/types'
import { formatMoney } from '../../domain/money'
import { Card, EmptyState, Pill, TextInput } from '../../ui/components'
import { Page } from '../../ui/Page'

type Filter = 'all' | 'unpaid' | 'unsent'
type MonthFilter = Period | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'unpaid', label: 'Chưa thu xong' },
  { value: 'unsent', label: 'Chưa gửi' },
  { value: 'all', label: 'Tất cả' },
]

function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

function matchesRoomSearch(roomLabel: string, query: string): boolean {
  if (!query) return true
  return normalizeSearch(roomLabel).includes(normalizeSearch(query))
}

export function InvoiceListPage() {
  const data = useDataset()
  const [filter, setFilter] = useState<Filter>('unpaid')
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('all')
  const [search, setSearch] = useState('')

  const roomName = useMemo(
    () => new Map(data.rooms.map((r) => [r.id, r.name])),
    [data.rooms],
  )
  const roomById = useMemo(() => buildRoomById(data.rooms), [data.rooms])

  const availableMonths = useMemo(() => {
    const periods = new Set(data.invoices.map((invoice) => dt.periodOf(invoice.issueDate)))
    return [...periods].sort((a, b) => b.localeCompare(a))
  }, [data.invoices])

  const invoices = useMemo(() => {
    const query = search.trim()
    return data.invoices
      .filter((invoice) => {
        if (monthFilter !== 'all' && dt.periodOf(invoice.issueDate) !== monthFilter) return false
        const label = roomName.get(invoice.roomId) ?? ''
        if (!matchesRoomSearch(label, query)) return false
        if (filter === 'unpaid') return statusOf(invoice) !== 'paid'
        if (filter === 'unsent') return !invoice.sentAt && !wasCarriedForward(invoice)
        return true
      })
      .sort((a, b) => compareInvoicesByRoom(a, b, roomById, 'desc'))
  }, [data.invoices, filter, monthFilter, roomById, roomName, search])

  const hasActiveFilters = filter !== 'all' || monthFilter !== 'all' || search.trim().length > 0

  const totalOutstanding = data.invoices.reduce((acc, invoice) => {
    const remaining = outstandingOf(invoice)
    return remaining > 0 ? acc + remaining : acc
  }, 0)

  return (
    <Page title="Phiếu" subtitle={totalOutstanding > 0 ? `Còn phải thu ${formatMoney(totalOutstanding)} đ` : 'Đã thu đủ'}>
      <TextInput
        value={search}
        onChange={setSearch}
        placeholder="Tìm phòng (vd: 01, Phòng 02…)"
      />

      {availableMonths.length > 0 && (
        <div className="chip-row" style={{ marginTop: 10 }}>
          <button
            className={monthFilter === 'all' ? 'chip active' : 'chip'}
            onClick={() => setMonthFilter('all')}
          >
            Mọi tháng
          </button>
          {availableMonths.map((period) => (
            <button
              key={period}
              className={monthFilter === period ? 'chip active' : 'chip'}
              onClick={() => setMonthFilter(period)}
            >
              {dt.formatInvoiceMonthShort(period)}
            </button>
          ))}
        </div>
      )}

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
          text={
            hasActiveFilters
              ? 'Không có phiếu nào khớp bộ lọc.'
              : filter === 'all'
                ? 'Chưa có phiếu nào.'
                : 'Không có phiếu nào ở mục này.'
          }
          action={
            hasActiveFilters ? (
              <button
                className="btn"
                onClick={() => {
                  setFilter('all')
                  setMonthFilter('all')
                  setSearch('')
                }}
              >
                Xoá bộ lọc
              </button>
            ) : (
              <Link className="btn primary" to="/phat-phieu">
                Phát phiếu
              </Link>
            )
          }
        />
      ) : (
        <Card flush>
          {invoices.map((invoice) => {
            const remaining = outstandingOf(invoice)
            const status = statusOf(invoice)
            const absorbedBy = invoiceAbsorbedBy(data, invoice)
            const archived = wasCarriedForward(invoice)
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
                      {invoice.kind === 'adjustment' && <Pill tone="accent">Cọc bổ sung</Pill>}
                      {!invoice.sentAt && !archived && <Pill tone="muted">Chưa gửi</Pill>}
                      {archived && <Pill tone="muted">Đã gộp</Pill>}
                    </div>
                    <div className="tiny muted" style={{ marginTop: 3 }}>
                      {dt.formatDate(invoice.issueDate)} ·{' '}
                      {invoiceStatusLabel(invoice, absorbedBy?.code)}
                    </div>
                  </div>
                  <div className="right">
                    <div className="num strong" style={archived ? { opacity: 0.55 } : undefined}>
                      {formatMoney(Math.abs(invoice.total))} đ
                    </div>
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
