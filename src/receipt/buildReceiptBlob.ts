import { invoicesOfTenancy, tenantsOf } from '../data/selectors'
import type { Dataset } from '../data/store'
import { outstandingOf } from '../domain/billing'
import * as dt from '../domain/dates'
import type { Invoice } from '../domain/types'
import { renderReceipt } from './renderReceipt'
import { vietQRDataUrl } from './vietqr'

function transferNoteFor(roomName: string, issueDate: string): string {
  const { year, month } = dt.parseISO(issueDate)
  return `${roomName} T${String(month).padStart(2, '0')}.${year}`
}

function rentNoteFor(data: Dataset, invoice: Invoice): string | undefined {
  if (invoice.kind !== 'monthly' || invoice.rentFrom) return undefined
  const covered = invoicesOfTenancy(data, invoice.tenancyId)
    .filter((i) => i.rentTo && i.issueDate <= invoice.issueDate)
    .map((i) => i.rentTo!)
    .sort()
    .pop()
  return covered ? `Tiền phòng đã đóng tới ngày ${dt.formatDate(covered)}` : undefined
}

export async function buildReceiptBlob(data: Dataset, invoice: Invoice): Promise<Blob> {
  const room = data.rooms.find((r) => r.id === invoice.roomId)
  if (!room) throw new Error('Không tìm thấy phòng của phiếu')

  const remaining = outstandingOf(invoice)
  const qrAmount = remaining > 0 ? remaining : invoice.total
  const transferNote = transferNoteFor(room.name, invoice.issueDate)
  const qrDataUrl = await vietQRDataUrl({
    bankBin: data.settings.bankBin,
    accountNo: data.settings.bankAccountNo,
    amount: qrAmount,
    message: transferNote,
  })

  return renderReceipt({
    settings: data.settings,
    room,
    invoice,
    occupants: tenantsOf(data, invoice.tenancyId).map((t) => t.fullName),
    qrDataUrl,
    transferNote,
    rentPaidThroughNote: rentNoteFor(data, invoice),
  })
}
