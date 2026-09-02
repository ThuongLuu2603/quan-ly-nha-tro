import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { reorderRooms } from '../../data/actions'
import { roomOverview } from '../../data/selectors'
import type { Dataset } from '../../data/store'
import { today } from '../../domain/dates'
import { formatMoney } from '../../domain/money'
import type { ID, Room } from '../../domain/types'
import { Pill } from '../../ui/components'

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function RoomSortableList({ data }: { data: Dataset }) {
  const now = today()
  const [orderedIds, setOrderedIds] = useState<ID[]>(() => data.rooms.map((r) => r.id))
  const dragIndex = useRef<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const orderedIdsRef = useRef(orderedIds)

  useEffect(() => {
    setOrderedIds(data.rooms.map((r) => r.id))
  }, [data.rooms])

  useEffect(() => {
    orderedIdsRef.current = orderedIds
  }, [orderedIds])

  const roomById = new Map(data.rooms.map((r) => [r.id, r]))
  const rooms = orderedIds.map((id) => roomById.get(id)).filter((r): r is Room => Boolean(r))

  const onPointerMove = (e: PointerEvent) => {
    if (dragIndex.current === null || !listRef.current) return
    const rows = listRef.current.querySelectorAll<HTMLElement>('[data-room-index]')
    let target: number | null = null
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (e.clientY < mid) {
        target = Number(row.dataset.roomIndex)
        break
      }
    }
    if (target === null && rows.length > 0) {
      target = Number(rows[rows.length - 1].dataset.roomIndex)
    }
    if (target === null || target === dragIndex.current) return
    const from = dragIndex.current
    setOrderedIds((prev) => moveItem(prev, from, target!))
    dragIndex.current = target
    setOverIndex(target)
  }

  const endDrag = async (e: PointerEvent) => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
    const handle = e.target as HTMLElement | null
    if (handle?.releasePointerCapture) {
      try {
        handle.releasePointerCapture(e.pointerId)
      } catch {
        // pointer already released
      }
    }
    if (dragIndex.current !== null) {
      await reorderRooms(orderedIdsRef.current)
    }
    dragIndex.current = null
    setOverIndex(null)
    setDragging(false)
  }

  const startDrag = (index: number, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragIndex.current = index
    setOverIndex(index)
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  return (
    <div ref={listRef}>
      <div className="room-sort-hint">Giữ ⋮⋮ kéo lên/xuống để sắp xếp thứ tự phòng.</div>
      {rooms.map((room, index) => {
        const overview = roomOverview(data, room.id, now)
        const isDragged = dragging && dragIndex.current === index
        const isOver = dragging && overIndex === index
        return (
          <div
            key={room.id}
            data-room-index={index}
            className={`room-row${isDragged ? ' dragging' : ''}${isOver ? ' drag-over' : ''}`}
          >
            <button
              type="button"
              className="room-drag-handle"
              aria-label={`Kéo để sắp xếp ${room.name}`}
              onPointerDown={(e) => startDrag(index, e)}
            >
              ⋮⋮
            </button>
            <Link className="room-row-link" to={`/phong/${room.id}`} draggable={false}>
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
          </div>
        )
      })}
    </div>
  )
}
