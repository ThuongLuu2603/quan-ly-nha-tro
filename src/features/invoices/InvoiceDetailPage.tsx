import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteInvoice, markInvoiceSent, removePayment } from '../../data/actions'
import {
  invoiceStatusLabel,
  invoicesOfTenancy,
  invoiceAbsorbedBy,
  primaryTenant,
  tenantsOf,
} from '../../data/selectors'
import { useDataset } from '../../data/store'
import { outstandingOf, paidAmount, statusOf, wasCarriedForward } from '../../domain/billing'
import * as dt from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { Invoice } from '../../domain/types'
import { renderReceipt } from '../../receipt/renderReceipt'
import { copyImageToClipboard, downloadBlob, openZaloChat, shareImage } from '../../receipt/share'
import { vietQRDataUrl } from '../../receipt/vietqr'
import { Banner, Card, EmptyState, Pill, useToast } from '../../ui/components'
import { Page } from '../../ui/Page'
import { PaymentSheet } from './PaymentSheet'

function transferNoteFor(roomName: string, issueDate: string): string {
  const { year, month } = dt.parseISO(issueDate)
  return `${roomName} T${String(month).padStart(2, '0')}.${year}`
}

export function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const data = useDataset()
  const { toast, toastNode } = useToast()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [paying, setPaying] = useState(false)
  const blobRef = useRef<Blob | null>(null)

  const invoice = data.invoices.find((i) => i.id === invoiceId)
  const room = invoice ? data.rooms.find((r) => r.id === invoice.roomId) : undefined

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false

    async function build(current: Invoice) {
      if (!room) return
      setRendering(true)
      try {
        const remaining = outstandingOf(current)
        const qrAmount = remaining > 0 ? remaining : current.total
        const note = transferNoteFor(room.name, current.issueDate)
        const qrDataUrl = await vietQRDataUrl({
          bankBin: data.settings.bankBin,
          accountNo: data.settings.bankAccountNo,
          amount: qrAmount,
          message: note,
        })

        const blob = await renderReceipt({
          settings: data.settings,
          room,
          invoice: current,
          occupants: tenantsOf(data, current.tenancyId).map((t) => t.fullName),
          qrDataUrl,
          transferNote: note,
          rentPaidThroughNote: rentNoteFor(current),
        })

        if (cancelled) return
        blobRef.current = blob
        const url = URL.createObjectURL(blob)
        revoked = url
        setImageUrl(url)
      } catch {
        if (!cancelled) toast('Không dựng được ảnh phiếu trên trình duyệt này')
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    function rentNoteFor(current: Invoice): string | undefined {
      if (current.kind !== 'monthly' || current.rentFrom) return undefined
      const covered = invoicesOfTenancy(data, current.tenancyId)
        .filter((i) => i.rentTo && i.issueDate <= current.issueDate)
        .map((i) => i.rentTo!)
        .sort()
        .pop()
      return covered ? `Tiền phòng đã đóng tới ngày ${dt.formatDate(covered)}` : undefined
    }

    if (invoice && room) void build(invoice)

    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, invoice?.total, invoice?.payments.length, room?.id, data.settings])

  if (!invoice || !room) {
    return (
      <Page title="Phiếu" back="/phieu">
        <EmptyState icon="🔍" text="Không tìm thấy phiếu này." />
      </Page>
    )
  }

  const paid = paidAmount(invoice)
  const remaining = outstandingOf(invoice)
  const status = statusOf(invoice)
  const carried = wasCarriedForward(invoice)
  const absorbedBy = invoiceAbsorbedBy(data, invoice)
  const isRefund = invoice.total < 0
  const primary = primaryTenant(data, invoice.tenancyId)
  const note = transferNoteFor(room.name, invoice.issueDate)

  const share = async () => {
    if (!blobRef.current) return
    const outcome = await shareImage(
      blobRef.current,
      `phieu-${invoice.code}.png`,
      `Phiếu tiền phòng ${room.name} · ${note}`,
    )
    if (outcome === 'cancelled') return
    await markInvoiceSent(invoice.id)
    toast(outcome === 'shared' ? 'Đã mở khay chia sẻ' : 'Máy không hỗ trợ chia sẻ, đã tải ảnh về')
  }

  const sendZaloToTenant = async () => {
    if (!primary?.phone) return
    if (blobRef.current) {
      const copied = await copyImageToClipboard(blobRef.current)
      await markInvoiceSent(invoice.id)
      openZaloChat(primary.phone)
      toast(
        copied
          ? `Đã mở chat Zalo tới ${primary.fullName} — dán ảnh phiếu vào khung chat`
          : `Đã mở chat Zalo tới ${primary.fullName} — gửi ảnh phiếu bằng nút Tải ảnh`,
      )
      return
    }
    await markInvoiceSent(invoice.id)
    openZaloChat(primary.phone)
    toast(`Đã mở chat Zalo tới ${primary.fullName}`)
  }

  return (
    <Page
      title={`Phòng ${room.name}`}
      back="/phieu"
      subtitle={`${dt.formatDate(invoice.issueDate)} · ${invoice.code}`}
    >
      <div className="row wrap" style={{ marginBottom: 12, gap: 8 }}>
        {status === 'paid' && (
          <Pill tone={carried ? 'muted' : 'ok'}>
            {invoiceStatusLabel(invoice, absorbedBy?.code)}
          </Pill>
        )}
        {status === 'partial' && <Pill tone="warn">Thu một phần</Pill>}
        {status === 'unpaid' && <Pill tone="danger">{isRefund ? 'Chưa trả khách' : 'Chưa thu'}</Pill>}
        {invoice.sentAt ? <Pill tone="muted">Đã gửi</Pill> : <Pill tone="muted">Chưa gửi</Pill>}
        {invoice.kind === 'moveIn' && <Pill tone="accent">Nhận phòng</Pill>}
        {invoice.kind === 'checkout' && <Pill tone="warn">Tất toán</Pill>}
        {invoice.kind === 'adjustment' && <Pill tone="accent">Cọc bổ sung</Pill>}
      </div>

      <Card title="Nội dung phiếu">
        {invoice.lines.map((line) => (
          <div className="line-row" key={line.id}>
            <div className="grow">
              <div>{line.label}</div>
              {line.detail && <div className="tiny muted">{line.detail}</div>}
            </div>
            <div className="num">{formatMoney(line.amount)} đ</div>
          </div>
        ))}
        <div className="total-row">
          <span>{isRefund ? 'Trả lại khách' : 'Tổng cộng'}</span>
          <span className="num">{formatMoney(Math.abs(invoice.total))} đ</span>
        </div>

        {Math.abs(paid) >= 1 && (
          <div className="stack tight" style={{ marginTop: 12 }}>
            <div className="row between small">
              <span className="muted">Đã thanh toán</span>
              <span className="num">{formatMoney(Math.abs(paid))} đ</span>
            </div>
            <div className="row between small strong">
              <span>Còn lại</span>
              <span className="num">{formatMoney(Math.abs(remaining))} đ</span>
            </div>
          </div>
        )}
      </Card>

      <Card title="Gửi cho khách">
        <div className="stack tight">
          {primary?.phone ? (
            <button
              className="btn primary block"
              onClick={sendZaloToTenant}
              disabled={!imageUrl || rendering}
            >
              {rendering
                ? 'Đang dựng ảnh phiếu...'
                : `Gửi Zalo cho ${primary.fullName}`}
            </button>
          ) : (
            <Banner tone="warn">
              Chưa có số Zalo người đại diện. Vào hồ sơ người ở để thêm số điện thoại.
            </Banner>
          )}

          <button className="btn block" onClick={share} disabled={!imageUrl || rendering}>
            Chia sẻ ảnh phiếu (app khác)
          </button>

          {data.settings.phone && (
            <div className="tiny muted">
              Tin nhắn gửi từ Zalo đang đăng nhập trên máy này. Số {data.settings.phone} trên phiếu
              là số liên hệ chủ trọ — app không gửi tin thay bạn qua máy chủ Zalo.
            </div>
          )}

          <button
            className="btn block"
            disabled={!blobRef.current}
            onClick={() => {
              if (blobRef.current) downloadBlob(blobRef.current, `phieu-${invoice.code}.png`)
            }}
          >
            Tải ảnh về máy
          </button>

          {!data.settings.bankAccountNo && (
            <Banner tone="info">
              Chưa khai số tài khoản trong Cài đặt nên phiếu chưa có mã QR chuyển khoản.
            </Banner>
          )}
        </div>
      </Card>

      {imageUrl && (
        <Card title="Xem trước ảnh phiếu">
          <img className="receipt-preview" src={imageUrl} alt={`Phiếu ${invoice.code}`} />
        </Card>
      )}

      <Card
        title="Thanh toán"
        action={
          status !== 'paid' ? (
            <button className="btn ghost" onClick={() => setPaying(true)}>
              + Ghi nhận
            </button>
          ) : undefined
        }
      >
        {carried && (
          <Banner tone="info">
            Phiếu này không cần gửi hay thu thêm — khoản tiền đã được gộp vào{' '}
            {absorbedBy ? (
              <Link to={`/phieu/${absorbedBy.id}`} style={{ fontWeight: 700 }}>
                {absorbedBy.code}
              </Link>
            ) : (
              'phiếu tháng sau'
            )}
            .
          </Banner>
        )}

        {invoice.payments.length === 0 ? (
          <div className="muted small">
            {isRefund ? 'Chưa trả lại khách đồng nào.' : 'Chưa thu đồng nào.'}
          </div>
        ) : (
          <div className="stack tight">
            {invoice.payments.map((payment) => (
              <div className="row between" key={payment.id}>
                <div className="grow">
                  <div className="small">
                    {dt.formatDate(payment.date)} ·{' '}
                    {payment.method === 'cash'
                      ? 'Tiền mặt'
                      : payment.method === 'transfer'
                        ? 'Chuyển khoản'
                        : 'Dồn nợ sang phiếu sau'}
                  </div>
                  {payment.note && <div className="tiny muted">{payment.note}</div>}
                </div>
                <div className="num">{formatMoney(Math.abs(payment.amount))} đ</div>
                {payment.method !== 'carried' && (
                  <button
                    className="btn ghost sm"
                    onClick={() => removePayment(invoice.id, payment.id)}
                    aria-label="Xoá khoản này"
                  >
                    Xoá
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <button
        className="btn danger block"
        onClick={async () => {
          const ok = window.confirm(
            invoice.rentFrom
              ? 'Xoá phiếu này? Kỳ tiền phòng của phiếu sẽ được trả lại thành chưa thu.'
              : 'Xoá phiếu này?',
          )
          if (!ok) return
          await deleteInvoice(invoice.id)
          navigate('/phieu', { replace: true })
        }}
      >
        Xoá phiếu
      </button>

      {paying && (
        <PaymentSheet
          invoiceId={invoice.id}
          remaining={remaining}
          isRefund={isRefund}
          onClose={() => setPaying(false)}
        />
      )}
      {toastNode}
    </Page>
  )
}
