import { useEffect, useMemo, useState } from 'react'
import { addExpense, deleteExpense } from '../../data/actions'
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
import {
  buildSettlementWindow,
  collectByMethodInPeriod,
  withRunningBalance,
} from '../../domain/cashflow'
import * as dt from '../../domain/dates'
import { buildRoomById, compareInvoicesByRoom } from '../../domain/roomOrder'
import { formatMoney, formatNumber } from '../../domain/money'
import { downloadBlob } from '../../receipt/share'
import { OfflineReadOnlyError } from '../../sync/mutation'
import type { ExpenseKind, ISODate, Invoice, Period } from '../../domain/types'
import {
  Banner,
  Card,
  DateInput,
  EmptyState,
  Field,
  MoneyInput,
  TextInput,
  useToast,
} from '../../ui/components'
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
  cashAmount: number
  transferAmount: number
  cashRooms: number
  transferRooms: number
}

type ChartMode = 'revenue' | 'utilities'
type ReportTab = 'revenue' | 'ledger'

const CHART_MODES: { key: ChartMode; label: string }[] = [
  { key: 'revenue', label: 'Doanh thu' },
  { key: 'utilities', label: 'Trọ · Điện · Nước' },
]

const CHART_COLORS = ['var(--accent)', '#d97706', '#2563eb']

function barColor(index: number): string {
  return CHART_COLORS[index] ?? 'var(--accent)'
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

/** Biểu đồ cột SVG theo tháng — chọn chỉ số để xem. */
function RevenueChart({
  months,
  year,
  mode,
  showValues,
}: {
  months: MonthStat[]
  year: number
  mode: ChartMode
  showValues: boolean
}) {
  const width = 720
  const height = 200
  const padL = 44
  const padR = 12
  const padT = 18
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB
  const seriesCount = mode === 'revenue' ? 2 : 3
  const gap = 10
  const groupW = plotW / Math.max(months.length, 1)
  const barW = Math.min(18, (groupW - gap) / seriesCount)

  const values = months.flatMap((m) =>
    mode === 'revenue'
      ? [m.billed, m.collected]
      : [m.breakdown.rent, m.breakdown.electric, m.breakdown.water],
  )
  const max = Math.max(1, ...values)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t))

  return (
    <svg className="revenue-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Biểu đồ năm ${year}`}>
      {ticks.map((tick) => {
        const y = padT + plotH - (tick / max) * plotH
        return (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
              {tick >= 1_000_000 ? `${Math.round(tick / 1_000_000)}tr` : tick >= 1000 ? `${Math.round(tick / 1000)}k` : tick}
            </text>
          </g>
        )
      })}
      {months.map((m, mi) => {
        const groupX = padL + mi * groupW + gap / 2
        const series =
          mode === 'revenue'
            ? [m.billed, m.collected]
            : [m.breakdown.rent, m.breakdown.electric, m.breakdown.water]
        return (
          <g key={m.period}>
            {series.map((value, si) => {
              const h = (value / max) * plotH
              const x = groupX + si * barW
              const y = padT + plotH - h
              return (
                <g key={si}>
                  <rect
                    x={x}
                    y={y}
                    width={Math.max(barW - 2, 2)}
                    height={Math.max(h, 0)}
                    rx={3}
                    fill={barColor(si)}
                    opacity={mode === 'revenue' && si === 0 ? 0.35 : 1}
                  />
                  {showValues && value > 0 && (
                    <text
                      x={x + (barW - 2) / 2}
                      y={y - 3}
                      textAnchor="middle"
                      fontSize={8}
                      fill="var(--muted)"
                    >
                      {value >= 1_000_000
                        ? `${(value / 1_000_000).toFixed(1)}tr`
                        : value >= 1000
                          ? `${Math.round(value / 1000)}k`
                          : value}
                    </text>
                  )}
                </g>
              )
            })}
            <text
              x={groupX + (seriesCount * barW) / 2}
              y={height - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted)"
            >
              {m.period.slice(5)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

type LedgerScope = 'month' | 'year'

function CashflowTab({ year }: { year: number }) {
  const data = useDataset()
  const { toast, toastNode } = useToast()
  const [kind, setKind] = useState<ExpenseKind>('electric')
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(dt.today())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const currentPeriod = dt.periodOf(dt.today())
  const [scope, setScope] = useState<LedgerScope>('month')
  const [month, setMonth] = useState<Period>(() =>
    currentPeriod.startsWith(String(year)) ? currentPeriod : (`${year}-01` as Period),
  )

  useEffect(() => {
    if (month.startsWith(String(year))) return
    const todayPeriod = dt.periodOf(dt.today())
    setMonth((todayPeriod.startsWith(String(year)) ? todayPeriod : `${year}-01`) as Period)
  }, [year, month])

  const roomById = useMemo(() => new Map(data.rooms.map((r) => [r.id, r.name])), [data.rooms])
  const yearMonths = useMemo(() => dt.periodRange(`${year}-01`, `${year}-12`), [year])

  const ledger = useMemo(
    () =>
      buildSettlementWindow(
        data.invoices,
        data.expenses,
        (roomId) => roomById.get(roomId) ?? 'Phòng',
        scope === 'year' ? { year } : { period: month },
      ),
    [data.invoices, data.expenses, roomById, scope, year, month],
  )

  const rows = useMemo(
    () => withRunningBalance(ledger.entries, ledger.opening),
    [ledger.entries, ledger.opening],
  )
  const summary = ledger.summary

  const rangeLabel = scope === 'year' ? `năm ${year}` : dt.formatPeriod(month)
  const openingLabel =
    scope === 'year' ? `Số dư đầu năm ${year}` : `Số dư đầu ${dt.formatPeriodShort(month)}`

  const saveExpense = async () => {
    if (amount <= 0 || saving) return
    if (kind === 'other' && !note.trim()) return
    setSaving(true)
    try {
      await addExpense({
        date,
        kind,
        amount,
        note: note.trim() || undefined,
      })
      setAmount(0)
      setNote('')
      toast(
        kind === 'electric'
          ? 'Đã ghi chi tiền điện'
          : kind === 'water'
            ? 'Đã ghi chi tiền nước'
            : 'Đã ghi chi khác',
      )
    } catch (error) {
      toast(
        error instanceof OfflineReadOnlyError
          ? 'Cần mạng / đăng nhập để ghi chi'
          : error instanceof Error
            ? error.message
            : 'Không ghi được',
      )
    } finally {
      setSaving(false)
    }
  }

  const remove = async (expenseId: string) => {
    if (!window.confirm('Xóa khoản chi này?')) return
    try {
      await deleteExpense(expenseId)
      toast('Đã xóa khoản chi')
    } catch (error) {
      toast(
        error instanceof OfflineReadOnlyError
          ? 'Cần mạng / đăng nhập để xóa'
          : 'Không xóa được',
      )
    }
  }

  return (
    <>
      <Card title="Quyết toán theo tháng">
        <Banner tone="info">
          Thu theo <strong>kỳ thu</strong> (tháng phát phiếu). Chi điện/nước/khác theo tháng bạn ghi
          chi. Chọn tháng để xem quyết toán tháng đó.
        </Banner>
        <div className="chip-row" style={{ marginTop: 10, marginBottom: 10 }}>
          <button
            type="button"
            className={scope === 'month' ? 'chip active' : 'chip'}
            onClick={() => setScope('month')}
          >
            Theo tháng
          </button>
          <button
            type="button"
            className={scope === 'year' ? 'chip active' : 'chip'}
            onClick={() => setScope('year')}
          >
            Cả năm {year}
          </button>
        </div>

        {scope === 'month' && (
          <div className="chip-row">
            {yearMonths.map((p) => (
              <button
                key={p}
                type="button"
                className={p === month ? 'chip active' : 'chip'}
                onClick={() => setMonth(p)}
              >
                {dt.formatPeriodShort(p)}
              </button>
            ))}
          </div>
        )}

        <div className="tiny muted" style={{ marginTop: 8 }}>
          Đang quyết toán: <strong>{rangeLabel}</strong>
        </div>
      </Card>

      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat">
          <div className="label">Thu kỳ này</div>
          <div className="value" style={{ color: 'var(--ok)' }}>
            {formatMoney(summary.totalIn)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Chi kỳ này</div>
          <div className="value" style={{ color: 'var(--danger)' }}>
            {formatMoney(summary.totalOut)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Số dư cuối kỳ</div>
          <div
            className="value"
            style={{ color: ledger.closing >= 0 ? 'var(--accent)' : 'var(--danger)' }}
          >
            {formatMoney(ledger.closing)}
          </div>
        </div>
      </div>

      <Card title={`Tóm tắt · ${rangeLabel}`}>
        <div className="stack tight">
          <div className="row between small">
            <span className="muted">{openingLabel}</span>
            <span className="num">{formatMoney(ledger.opening)} đ</span>
          </div>
          <div className="row between small">
            <span className="muted">Thu tiền mặt</span>
            <span className="num">
              {formatMoney(summary.cashIn)} đ
              <span className="muted"> · {summary.cashRooms} phòng</span>
            </span>
          </div>
          <div className="row between small">
            <span className="muted">Thu chuyển khoản</span>
            <span className="num">
              {formatMoney(summary.transferIn)} đ
              <span className="muted"> · {summary.transferRooms} phòng</span>
            </span>
          </div>
          <div className="row between small">
            <span className="muted">Chi tiền điện</span>
            <span className="num" style={{ color: 'var(--danger)' }}>
              {formatMoney(summary.electricOut)} đ
            </span>
          </div>
          <div className="row between small">
            <span className="muted">Chi tiền nước</span>
            <span className="num" style={{ color: 'var(--danger)' }}>
              {formatMoney(summary.waterOut)} đ
            </span>
          </div>
          <div className="row between small">
            <span className="muted">Chi khác</span>
            <span className="num" style={{ color: 'var(--danger)' }}>
              {formatMoney(summary.otherOut)} đ
            </span>
          </div>
          <div
            className="row between"
            style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--line)' }}
          >
            <span className="small strong">Số dư cuối kỳ</span>
            <span className="num strong">{formatMoney(ledger.closing)} đ</span>
          </div>
        </div>
      </Card>

      <Card title="Ghi khoản chi">
        <Banner tone="info">
          Mỗi lần thu tiền mặt hoặc chuyển khoản tự thành <strong>1 dòng Vào</strong>. Chi điện / nước
          / khác bạn nhập ở đây thành <strong>1 dòng Ra</strong>.
        </Banner>
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="chip-row">
            <button
              type="button"
              className={kind === 'electric' ? 'chip active' : 'chip'}
              onClick={() => setKind('electric')}
            >
              Chi tiền điện
            </button>
            <button
              type="button"
              className={kind === 'water' ? 'chip active' : 'chip'}
              onClick={() => setKind('water')}
            >
              Chi tiền nước
            </button>
            <button
              type="button"
              className={kind === 'other' ? 'chip active' : 'chip'}
              onClick={() => setKind('other')}
            >
              Chi khác
            </button>
          </div>
          <div className="grid-2">
            <Field label="Ngày chi">
              <DateInput value={date} onChange={(v) => setDate(v as ISODate)} />
            </Field>
            <Field label="Số tiền">
              <MoneyInput value={amount} onChange={setAmount} />
            </Field>
          </div>
          <Field
            label="Ghi chú"
            hint={kind === 'other' ? 'Nên ghi rõ nội dung chi' : 'Tuỳ chọn — hoá đơn EVN, kỳ tháng...'}
          >
            <TextInput
              value={note}
              onChange={setNote}
              placeholder={
                kind === 'electric'
                  ? 'VD: Điện T08/2026'
                  : kind === 'water'
                    ? 'VD: Nước T08/2026'
                    : 'VD: Sửa ống nước, mua khóa...'
              }
            />
          </Field>
          <button
            className="btn primary block"
            disabled={amount <= 0 || saving || (kind === 'other' && !note.trim())}
            onClick={() => void saveExpense()}
          >
            {saving ? 'Đang lưu...' : 'Ghi khoản chi'}
          </button>
        </div>
      </Card>

      <Card title={`Sao kê · ${rangeLabel}`}>
        {rows.length === 0 && ledger.opening === 0 ? (
          <div className="muted small">
            Chưa có dòng nào trong giai đoạn này. Thu tiền trên phiếu sẽ hiện ở đây; chi điện/nước ghi
            ở form trên.
          </div>
        ) : (
          <div className="ledger">
            <div className="ledger-head">
              <span>Ngày</span>
              <span>Nội dung</span>
              <span className="right">Vào</span>
              <span className="right">Ra</span>
              <span className="right">Số dư</span>
            </div>
            <div className="ledger-row">
              <span className="tiny muted">
                {scope === 'year' ? `01/01/${year}` : dt.formatDate(dt.periodBounds(month).start)}
              </span>
              <span className="small strong">{openingLabel}</span>
              <span />
              <span />
              <span className="num tiny right strong">{formatMoney(ledger.opening)}</span>
            </div>
            {rows.map((row) => (
              <div className="ledger-row" key={row.id}>
                <span className="tiny muted">{dt.formatDate(row.date)}</span>
                <span>
                  <div className="small strong">{row.label}</div>
                  {row.detail && <div className="tiny muted">{row.detail}</div>}
                  {row.source === 'expense' && row.expenseId && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ marginTop: 4, padding: '0 6px', minHeight: 0 }}
                      onClick={() => void remove(row.expenseId!)}
                    >
                      Xóa
                    </button>
                  )}
                </span>
                <span className="num tiny right" style={{ color: 'var(--ok)' }}>
                  {row.direction === 'in' ? formatMoney(row.amount) : ''}
                </span>
                <span className="num tiny right" style={{ color: 'var(--danger)' }}>
                  {row.direction === 'out' ? formatMoney(row.amount) : ''}
                </span>
                <span className="num tiny right strong">{formatMoney(row.balance)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {toastNode}
    </>
  )
}

export function ReportsPage() {
  const data = useDataset()
  const [tab, setTab] = useState<ReportTab>('revenue')
  const [year, setYear] = useState(() => Number(dt.today().slice(0, 4)))
  const [openMonth, setOpenMonth] = useState<Period | null>(null)
  const [chartMode, setChartMode] = useState<ChartMode>('revenue')
  const [showValues, setShowValues] = useState(true)

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
      const methods = collectByMethodInPeriod(data.invoices, period)
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
        cashAmount: methods.cashAmount,
        transferAmount: methods.transferAmount,
        cashRooms: methods.cashRooms,
        transferRooms: methods.transferRooms,
      }
    })
  }, [data.invoices, year])

  const yearBreakdown = useMemo(() => revenueBreakdownFromInvoices(yearInvoices), [yearInvoices])

  const yearTotal = months.reduce(
    (acc, m) => ({ billed: acc.billed + m.billed, collected: acc.collected + m.collected }),
    { billed: 0, collected: 0 },
  )

  const yearMethods = useMemo(() => {
    return months.reduce(
      (acc, m) => ({
        cashAmount: acc.cashAmount + m.cashAmount,
        transferAmount: acc.transferAmount + m.transferAmount,
      }),
      { cashAmount: 0, transferAmount: 0 },
    )
  }, [months])

  const collectionRate =
    yearTotal.billed > 0 ? Math.round((yearTotal.collected / yearTotal.billed) * 100) : 0

  const kwhYear = months.reduce((acc, m) => acc + m.kwh, 0)
  const m3Year = months.reduce((acc, m) => acc + m.m3, 0)

  const best = useMemo(() => {
    const withData = months.filter((m) => m.billed > 0)
    if (withData.length === 0) return undefined
    return withData.reduce((acc, m) => (m.billed > acc.billed ? m : acc))
  }, [months])

  const occupancy = useMemo(() => {
    const occupied = data.rooms.filter((room) =>
      data.tenancies.some((t) => t.roomId === room.id && t.status === 'active'),
    )
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
    for (const expense of data.expenses) set.add(Number(expense.date.slice(0, 4)))
    for (const invoice of data.invoices) {
      for (const payment of invoice.payments) {
        if (payment.method === 'carried') continue
        set.add(Number(payment.date.slice(0, 4)))
      }
    }
    return [...set].sort((a, b) => b - a)
  }, [data.invoices, data.expenses])

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

  const empty = data.invoices.length === 0 && data.expenses.length === 0

  if (empty) {
    return (
      <Page title="Báo cáo" back="/">
        <EmptyState icon="report" text="Chưa có phiếu / thu chi nào để thống kê." />
      </Page>
    )
  }

  return (
    <Page title="Báo cáo" back="/">
      <div className="chip-row">
        <button
          type="button"
          className={tab === 'revenue' ? 'chip active' : 'chip'}
          onClick={() => setTab('revenue')}
        >
          Doanh thu
        </button>
        <button
          type="button"
          className={tab === 'ledger' ? 'chip active' : 'chip'}
          onClick={() => setTab('ledger')}
        >
          Sao kê quỹ
        </button>
      </div>

      <div className="chip-row">
        {years.map((y) => (
          <button key={y} className={y === year ? 'chip active' : 'chip'} onClick={() => setYear(y)}>
            Năm {y}
          </button>
        ))}
      </div>

      {tab === 'ledger' ? (
        <CashflowTab year={year} />
      ) : (
        <>
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
              <div
                className="value"
                style={{
                  color:
                    collectionRate >= 95
                      ? 'var(--ok)'
                      : collectionRate >= 80
                        ? 'var(--warn)'
                        : 'var(--danger)',
                }}
              >
                {collectionRate}%
              </div>
            </div>
          </div>

          <Card title={`Hình thức thu ${year}`}>
            <div className="stack tight">
              <div className="row between small">
                <span className="muted">Tiền mặt</span>
                <span className="num strong">{formatMoney(yearMethods.cashAmount)} đ</span>
              </div>
              <div className="row between small">
                <span className="muted">Chuyển khoản</span>
                <span className="num strong">{formatMoney(yearMethods.transferAmount)} đ</span>
              </div>
            </div>
          </Card>

          <Card title={`Biểu đồ ${year}`}>
            <div className="chip-row" style={{ marginBottom: 8 }}>
              {CHART_MODES.map((item) => (
                <button
                  key={item.key}
                  className={chartMode === item.key ? 'chip active' : 'chip'}
                  onClick={() => setChartMode(item.key)}
                >
                  {item.label}
                </button>
              ))}
              <button
                className={showValues ? 'chip active' : 'chip'}
                onClick={() => setShowValues((v) => !v)}
                title="Hiện/ẩn số trên cột"
              >
                123
              </button>
            </div>
            <div className="chart-legend tiny muted">
              {chartMode === 'revenue' ? (
                <>
                  <span>
                    <i className="dot" style={{ background: 'var(--accent)', opacity: 0.35 }} /> Ra
                    phiếu
                  </span>
                  <span>
                    <i className="dot" style={{ background: 'var(--accent)' }} /> Đã thu
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <i className="dot" style={{ background: CHART_COLORS[0] }} /> Tiền trọ
                  </span>
                  <span>
                    <i className="dot" style={{ background: CHART_COLORS[1] }} /> Tiền điện
                  </span>
                  <span>
                    <i className="dot" style={{ background: CHART_COLORS[2] }} /> Tiền nước
                  </span>
                </>
              )}
            </div>
            <RevenueChart months={months} year={year} mode={chartMode} showValues={showValues} />
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
                .filter(
                  (m) =>
                    m.count > 0 || m.cashAmount !== 0 || m.transferAmount !== 0,
                )
                .map((month) => {
                  const open = openMonth === month.period
                  const rate =
                    month.billed > 0 ? Math.round((month.collected / month.billed) * 100) : 100
                  return (
                    <div
                      key={month.period}
                      style={{ paddingBottom: 12, borderBottom: '1px solid var(--line)' }}
                    >
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
                      {!open && (
                        <div className="tiny muted" style={{ marginTop: 4 }}>
                          Mặt {formatMoney(month.cashAmount)} ({month.cashRooms} phòng) · CK{' '}
                          {formatMoney(month.transferAmount)} ({month.transferRooms} phòng)
                        </div>
                      )}
                      {open ? (
                        <div className="stack tight" style={{ marginTop: 10 }}>
                          <div className="row between small">
                            <span className="muted">Đã thu</span>
                            <span className="num" style={{ color: 'var(--ok)' }}>
                              {formatMoney(month.collected)} đ
                            </span>
                          </div>
                          <div className="row between small">
                            <span className="muted">Tiền mặt</span>
                            <span className="num">
                              {formatMoney(month.cashAmount)} đ
                              <span className="muted"> · {month.cashRooms} phòng</span>
                            </span>
                          </div>
                          <div className="row between small">
                            <span className="muted">Chuyển khoản</span>
                            <span className="num">
                              {formatMoney(month.transferAmount)} đ
                              <span className="muted"> · {month.transferRooms} phòng</span>
                            </span>
                          </div>
                          {month.debt > 0 && (
                            <div className="row between small">
                              <span className="muted">Còn nợ từ phiếu tháng này</span>
                              <span className="num" style={{ color: 'var(--danger)' }}>
                                {formatMoney(month.debt)} đ
                              </span>
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
              <span className="num strong">
                {occupancy.occupied.length}/{data.rooms.length} · {occupancy.rate}%
              </span>
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="muted small">Tiền cọc đang giữ</span>
              <span className="num">{formatMoney(totalDepositHeld(data))} đ</span>
            </div>
            {best && (
              <div className="row between" style={{ marginTop: 6 }}>
                <span className="muted small">Tháng ra phiếu cao nhất</span>
                <span className="num small">
                  {dt.formatPeriod(best.period)} · {formatMoney(best.billed)} đ
                </span>
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
        </>
      )}
    </Page>
  )
}
