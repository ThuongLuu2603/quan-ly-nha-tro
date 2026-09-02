import type { Invoice, Room } from './types'

export type RoomSortKey = Pick<Room, 'order' | 'name'>

/** Thứ tự phòng theo kéo-thả ở màn Phòng, rồi tên (01, 02, K01…). */
export function compareRooms(a: RoomSortKey, b: RoomSortKey): number {
  const orderDiff = a.order - b.order
  if (orderDiff !== 0) return orderDiff
  return a.name.localeCompare(b.name, 'vi', { numeric: true })
}

export function roomSortKey(room: RoomSortKey | undefined): RoomSortKey {
  return { order: room?.order ?? Number.MAX_SAFE_INTEGER, name: room?.name ?? '' }
}

export function buildRoomById(rooms: Room[]): Map<string, Room> {
  return new Map(rooms.map((room) => [room.id, room]))
}

export function compareInvoicesByRoom(
  a: Pick<Invoice, 'roomId' | 'issueDate' | 'createdAt'>,
  b: Pick<Invoice, 'roomId' | 'issueDate' | 'createdAt'>,
  roomById: Map<string, RoomSortKey>,
  issueDateOrder: 'asc' | 'desc' = 'desc',
): number {
  const roomCmp = compareRooms(roomSortKey(roomById.get(a.roomId)), roomSortKey(roomById.get(b.roomId)))
  if (roomCmp !== 0) return roomCmp

  const dateCmp = a.issueDate.localeCompare(b.issueDate)
  if (issueDateOrder === 'desc') {
    if (dateCmp !== 0) return -dateCmp
    return b.createdAt.localeCompare(a.createdAt)
  }
  if (dateCmp !== 0) return dateCmp
  return a.createdAt.localeCompare(b.createdAt)
}

export function compareRoomItems<T extends { room: RoomSortKey }>(a: T, b: T): number {
  return compareRooms(a.room, b.room)
}

export function compareRoomItemsByIssueDate<T extends { room: RoomSortKey; issueDate: string }>(
  a: T,
  b: T,
): number {
  const roomCmp = compareRooms(a.room, b.room)
  if (roomCmp !== 0) return roomCmp
  return a.issueDate.localeCompare(b.issueDate)
}
