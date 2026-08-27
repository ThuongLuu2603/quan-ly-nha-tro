import { useState } from 'react'
import { Link } from 'react-router-dom'
import { roomOverview } from '../../data/selectors'
import { useDataset } from '../../data/store'
import { today } from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import { Card, EmptyState, Pill } from '../../ui/components'
import { Page } from '../../ui/Page'
import { RoomFormSheet } from './RoomFormSheet'

export function RoomsPage() {
  const data = useDataset()
  const [adding, setAdding] = useState(false)
  const now = today()

  const occupied = data.rooms.filter((r) => data.tenancies.some((t) => t.roomId === r.id && t.status === 'active'))

  return (
    <Page title="Phòng" subtitle={`${occupied.length}/${data.rooms.length} phòng đang có khách`}>
      {data.rooms.length === 0 ? (
        <EmptyState
          icon="🏠"
          text="Chưa có phòng nào. Thêm phòng đầu tiên để bắt đầu."
          action={
            <button className="btn primary" onClick={() => setAdding(true)}>
              Thêm phòng
            </button>
          }
        />
      ) : (
        <Card flush>
          {data.rooms.map((room) => {
            const overview = roomOverview(data, room.id, now)
            return (
              <Link className="list-item" key={room.id} to={`/phong/${room.id}`}>
                <div className="row between">
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="strong" style={{ fontSize: 17 }}>
                        {room.name}
                      </span>
                      {overview.tenancy ? (
                        <Pill tone="ok">Đang ở</Pill>
                      ) : (
                        <Pill tone="muted">Trống</Pill>
                      )}
                      {overview.unpaidTotal > 0 && <Pill tone="danger">Còn nợ</Pill>}
                    </div>
                    <div className="small muted" style={{ marginTop: 3 }}>
                      {overview.tenancy
                        ? `${overview.primaryName || 'Chưa có tên'}${
                            overview.occupantCount > 1 ? ` +${overview.occupantCount - 1}` : ''
                          } · mốc ngày ${overview.tenancy.cycleDay}`
                        : `Giá tham khảo ${formatMoney(room.defaultRent)} đ`}
                    </div>
                  </div>
                  <div className="right">
                    {overview.tenancy && (
                      <div className="num strong">{formatMoney(overview.tenancy.rent)} đ</div>
                    )}
                    {overview.unpaidTotal > 0 && (
                      <div className="tiny" style={{ color: 'var(--danger)' }}>
                        nợ {formatMoney(overview.unpaidTotal)} đ
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </Card>
      )}

      {data.rooms.length > 0 && (
        <button className="fab" onClick={() => setAdding(true)}>
          + Phòng
        </button>
      )}

      {adding && <RoomFormSheet settings={data.settings} onClose={() => setAdding(false)} />}
    </Page>
  )
}
