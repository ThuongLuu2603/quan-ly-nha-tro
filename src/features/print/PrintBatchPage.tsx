import { useEffect, useMemo, useRef, useState } from 'react'
import { invoiceStatusLabel, invoiceAbsorbedBy } from '../../data/selectors'
import { useDataset } from '../../data/store'
import { outstandingOf } from '../../domain/billing'
import * as dt from '../../domain/dates'
import { buildRoomById, compareInvoicesByRoom } from '../../domain/roomOrder'
import { formatMoney } from '../../domain/money'
import type { ID, Period } from '../../domain/types'
import { buildReceiptBlob } from '../../receipt/buildReceiptBlob'
import {
  composeA4PrintPages,
  openPrintDialog,
  RECEIPTS_PER_A4_PAGE,
} from '../../receipt/printSheet'
import { downloadBlob } from '../../receipt/share'
import { Banner, Card, EmptyState, Pill, TextInput, useToast } from '../../ui/components'
import { Page } from '../../ui/Page'

type MonthFilter = Period | 'all'

export function PrintBatchPage() {
  const data = useDataset()
  const { toast, toastNode } = useToast()
  const [monthFilter, setMonthFilter] = useState<MonthFilter>(() => dt.periodOf(dt.today()))
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [busy, setBusy] = useState(false)
  const [pageUrls, setPageUrls] = useState<string[]>([])
  const pageBlobsRef = useRef<Blob[]>([])

  const roomName = useMemo(() => new Map(data.rooms.map((r) => [r.id, r.name])), [data.rooms])
  const roomById = useMemo(() => buildRoomById(data.rooms), [data.rooms])

  const selectedInvoices = useMemo(() => {
    return data.invoices
      .filter((invoice) => selected.has(invoice.id))
      .sort((a, b) => compareInvoicesByRoom(a, b, roomById, 'asc'))
  }, [data.invoices, roomById, selected])

  const printSlotOf = useMemo(() => {
    return new Map(selectedInvoices.map((invoice, index) => [invoice.id, index + 1]))
  }, [selectedInvoices])

  const availableMonths = useMemo(() => {
    const periods = new Set(data.invoices.map((invoice) => dt.periodOf(invoice.issueDate)))
    return [...periods].sort((a, b) => b.localeCompare(a))
  }, [data.invoices])

  const invoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.invoices
      .filter((invoice) => {
        if (monthFilter !== 'all' && dt.periodOf(invoice.issueDate) !== monthFilter) return false
        const label = (roomName.get(invoice.roomId) ?? '').toLowerCase()
        if (query && !label.includes(query)) return false
        return true
      })
      .sort((a, b) => compareInvoicesByRoom(a, b, roomById, 'asc'))
  }, [data.invoices, monthFilter, roomById, roomName, search])

  useEffect(() => {
    return () => {
      pageUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [pageUrls])

  const toggle = (id: ID) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    setSelected(new Set(invoices.map((i) => i.id)))
  }

  const clearPreview = () => {
    pageUrls.forEach((url) => URL.revokeObjectURL(url))
    pageBlobsRef.current = []
    setPageUrls([])
  }

  const buildPages = async () => {
    if (selected.size === 0) {
      toast('Chọn ít nhất một phiếu')
      return
    }

    setBusy(true)
    clearPreview()

    try {
      const ordered = selectedInvoices
      const receiptBlobs: Blob[] = []

      for (const invoice of ordered) {
        receiptBlobs.push(await buildReceiptBlob(data, invoice))
      }

      const pages = await composeA4PrintPages(receiptBlobs)
      pageBlobsRef.current = pages
      setPageUrls(pages.map((blob) => URL.createObjectURL(blob)))
      toast(`Đã dựng ${ordered.length} phiếu · ${pages.length} tờ A4`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Không tạo được bản in')
    } finally {
      setBusy(false)
    }
  }

  const doPrint = () => {
    if (pageBlobsRef.current.length === 0) {
      toast('Bấm «Dựng bản in» trước')
      return
    }
    try {
      openPrintDialog(pageBlobsRef.current)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Không mở được hộp thoại in')
    }
  }

  const pageCount = Math.ceil(selectedInvoices.length / RECEIPTS_PER_A4_PAGE)
  const visibleSelectedCount = invoices.filter((invoice) => selected.has(invoice.id)).length

  return (
    <Page title="In phiếu A4" back="/cai-dat">
      <Banner tone="info">
        Mỗi tờ A4 xếp <strong>4 phiếu</strong> (khổ ~A6): trên-trái → trên-phải → dưới-trái → dưới-phải.
        Phiếu được <strong>sắp theo thứ tự phòng</strong> (kéo thả ở màn Phòng). Bấm{' '}
        <strong>Dựng bản in</strong> → <strong>In ngay</strong>.
      </Banner>

      <TextInput value={search} onChange={setSearch} placeholder="Lọc theo tên phòng…" />

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

      <div className="row between" style={{ margin: '12px 0', gap: 8 }}>
        <span className="small muted">
          Đã chọn <strong>{selected.size}</strong>
          {visibleSelectedCount < selected.size && (
            <span>
              {' '}
              ({visibleSelectedCount} hiển thị · vẫn in đủ {selected.size})
            </span>
          )}
          {selected.size > 0 && (
            <span>
              {' '}
              · ~{pageCount} tờ A4
            </span>
          )}
        </span>
        <button className="btn ghost sm" onClick={selectAllVisible} disabled={invoices.length === 0}>
          Chọn tất cả
        </button>
      </div>

      {invoices.length === 0 ? (
        <EmptyState icon="print" text="Không có phiếu nào khớp bộ lọc." />
      ) : (
        <Card flush title="Chọn phiếu">
          {invoices.map((invoice) => {
            const room = roomName.get(invoice.roomId) ?? '?'
            const absorbedBy = invoiceAbsorbedBy(data, invoice)
            const checked = selected.has(invoice.id)
            const remaining = outstandingOf(invoice)
            const slot = printSlotOf.get(invoice.id)

            return (
              <button
                key={invoice.id}
                type="button"
                className="list-item"
                style={checked ? { background: 'var(--accent-soft)' } : undefined}
                onClick={() => toggle(invoice.id)}
              >
                <div className="row between">
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}>
                      {slot != null && <Pill tone="ok">#{slot}</Pill>}
                      <span className="strong">{room}</span>
                      <Pill tone="muted">{dt.formatDate(invoice.issueDate)}</Pill>
                      {checked && <Pill tone="ok">Chọn</Pill>}
                    </div>
                    <div className="tiny muted">{invoice.code}</div>
                  </div>
                  <div className="right">
                    <div className="num strong">{formatMoney(invoice.total)} đ</div>
                    <div className="tiny muted">
                      {invoiceStatusLabel(invoice, absorbedBy?.code)}
                      {remaining > 0 ? ` · còn ${formatMoney(remaining)}` : ''}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </Card>
      )}

      <button className="btn primary block" disabled={busy || selected.size === 0} onClick={buildPages}>
        {busy ? 'Đang dựng ảnh phiếu…' : `Dựng bản in (${selected.size} phiếu)`}
      </button>

      {pageUrls.length > 0 && (
        <Card title={`Xem trước · ${pageUrls.length} tờ A4`}>
          <div className="print-preview-grid">
            {pageUrls.map((url, index) => (
              <div className="print-preview-page" key={url}>
                <div className="tiny muted" style={{ marginBottom: 6 }}>
                  Trang {index + 1}
                </div>
                <img src={url} alt={`Trang in ${index + 1}`} />
                <button
                  className="btn ghost sm block"
                  style={{ marginTop: 8 }}
                  onClick={() => downloadBlob(pageBlobsRef.current[index]!, `in-phieu-trang-${index + 1}.png`)}
                >
                  Tải PNG
                </button>
              </div>
            ))}
          </div>
          <button className="btn block" style={{ marginTop: 12 }} onClick={doPrint}>
            In ngay (A4)
          </button>
        </Card>
      )}

      {toastNode}
    </Page>
  )
}
