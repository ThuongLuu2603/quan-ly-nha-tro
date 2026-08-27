import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRoom } from '../../data/actions'
import {
  activeTenancy,
  invoiceStatusLabel,
  invoicesOfRoom,
  readingsOfRoom,
  tenantsOf,
} from '../../data/selectors'
import { useDataset } from '../../data/store'
import { outstandingOf } from '../../domain/billing'
import * as dt from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { Tenant } from '../../domain/types'
import { Card, EmptyState, Pill } from '../../ui/components'
import { Page } from '../../ui/Page'
import { RoomFormSheet } from './RoomFormSheet'
import { TenantSheet } from './TenantSheet'

export function RoomDetailPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const data = useDataset()
  const [editing, setEditing] = useState(false)
  const [tenantSheet, setTenantSheet] = useState<{ tenant?: Tenant } | null>(null)

  const room = data.rooms.find((r) => r.id === roomId)
  if (!room) {
    return (
      <Page title="Phòng" back="/phong">
        <EmptyState icon="🔍" text="Không tìm thấy phòng này." />
      </Page>
    )
  }

  const tenancy = activeTenancy(data, room.id)
  const tenants = tenantsOf(data, tenancy?.id)
  const invoices = invoicesOfRoom(data, room.id)
  const readings = readingsOfRoom(data, room.id).slice(-6).reverse()

  return (
    <Page title={`Phòng ${room.name}`} back="/phong" subtitle={room.note}>
      {tenancy ? (
        <Card title="Lượt thuê hiện tại">
          <div className="stack tight">
            <div className="row between">
              <span className="muted small">Giá thuê</span>
              <span className="num strong">{formatMoney(tenancy.rent)} đ / tháng</span>
            </div>
            <div className="row between">
              <span className="muted small">Tiền cọc đang giữ</span>
              <span className="num">{formatMoney(tenancy.deposit)} đ</span>
            </div>
            <div className="row between">
              <span className="muted small">Mốc ngày</span>
              <span>ngày {tenancy.cycleDay} hàng tháng</span>
            </div>
            <div className="row between">
              <span className="muted small">Ngày dọn vào</span>
              <span>{dt.formatDate(tenancy.startDate)}</span>
            </div>
            <div className="row between">
              <span className="muted small">Đã đóng tiền phòng tới</span>
              <span className="strong">{dt.formatDate(tenancy.rentPaidThrough)}</span>
            </div>
            <div className="row between">
              <span className="muted small">Chỉ số bàn giao</span>
              <span className="num">
                điện {tenancy.electricStart} · nước {tenancy.waterStart}
              </span>
            </div>
          </div>

          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <Link className="btn grow" to={`/phong/${room.id}/tra-phong`}>
              Trả phòng
            </Link>
          </div>
        </Card>
      ) : (
        <Card title="Trạng thái">
          <div className="stack">
            <div className="muted">Phòng đang trống.</div>
            <Link className="btn primary block" to={`/phong/${room.id}/nhan-phong`}>
              Nhận khách vào ở
            </Link>
          </div>
        </Card>
      )}

      {tenancy && (
        <Card
          title={`Người lưu trú (${tenants.length})`}
          action={
            <button className="btn ghost" onClick={() => setTenantSheet({})}>
              + Thêm
            </button>
          }
        >
          {tenants.length === 0 ? (
            <div className="muted small">Chưa có ai, thêm người đại diện để in lên phiếu.</div>
          ) : (
            <div className="stack tight">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  className="row between"
                  onClick={() => setTenantSheet({ tenant })}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '6px 0',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span className="grow">
                    {tenant.fullName}
                    {tenant.phone && <span className="muted small"> · {tenant.phone}</span>}
                  </span>
                  {tenant.isPrimary && <Pill tone="accent">Đại diện</Pill>}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="Chỉ số điện nước gần đây">
        {readings.length === 0 ? (
          <div className="muted small">Chưa có chỉ số nào.</div>
        ) : (
          <div className="stack tight">
            {readings.map((reading) => (
              <div className="row between" key={reading.id}>
                <span className="small muted">{dt.formatPeriod(reading.period)}</span>
                <span className="num small">
                  điện {reading.electricEnd} · nước {reading.waterEnd}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Phiếu của phòng (${invoices.length})`} flush>
        {invoices.length === 0 ? (
          <div className="muted small" style={{ padding: '0 16px 16px' }}>
            Chưa phát phiếu nào.
          </div>
        ) : (
          invoices.slice(0, 12).map((invoice) => {
            const remaining = outstandingOf(invoice)
            return (
              <Link className="list-item" key={invoice.id} to={`/phieu/${invoice.id}`}>
                <div className="row between">
                  <div className="grow">
                    <div className="strong">{dt.formatDate(invoice.issueDate)}</div>
                    <div className="tiny muted">{invoiceStatusLabel(invoice)}</div>
                  </div>
                  <div className="right">
                    <div className="num strong">{formatMoney(Math.abs(invoice.total))} đ</div>
                    {Math.abs(remaining) >= 1 && (
                      <div className="tiny" style={{ color: 'var(--danger)' }}>
                        còn {formatMoney(Math.abs(remaining))} đ
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </Card>

      <Card title="Thiết lập phòng">
        <div className="stack tight">
          <div className="row between">
            <span className="muted small">Giá điện</span>
            <span className="num">{formatMoney(room.electricPrice)} đ / kWh</span>
          </div>
          <div className="row between">
            <span className="muted small">Giá nước</span>
            <span className="num">{formatMoney(room.waterPrice)} đ / m³</span>
          </div>
          {room.extraFees.map((fee) => (
            <div className="row between" key={fee.id}>
              <span className="muted small">{fee.label}</span>
              <span className="num">{formatMoney(fee.amount)} đ / tháng</span>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn grow" onClick={() => setEditing(true)}>
            Sửa phòng
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              const ok = window.confirm(
                `Xoá phòng ${room.name} cùng toàn bộ lượt thuê, chỉ số và phiếu của phòng này?`,
              )
              if (!ok) return
              await deleteRoom(room.id)
              navigate('/phong')
            }}
          >
            Xoá
          </button>
        </div>
      </Card>

      {editing && (
        <RoomFormSheet room={room} settings={data.settings} onClose={() => setEditing(false)} />
      )}
      {tenantSheet && tenancy && (
        <TenantSheet
          tenancyId={tenancy.id}
          tenant={tenantSheet.tenant}
          onClose={() => setTenantSheet(null)}
        />
      )}
    </Page>
  )
}
