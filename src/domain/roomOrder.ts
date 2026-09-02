import type { Room } from './types'

/** Thứ tự phòng theo kéo-thả ở màn Phòng, rồi tên (01, 02, K01…). */
export function compareRooms(a: Pick<Room, 'order' | 'name'>, b: Pick<Room, 'order' | 'name'>): number {
  const orderDiff = a.order - b.order
  if (orderDiff !== 0) return orderDiff
  return a.name.localeCompare(b.name, 'vi', { numeric: true })
}
