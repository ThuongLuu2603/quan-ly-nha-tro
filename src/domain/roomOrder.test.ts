import { describe, expect, it } from 'vitest'
import { compareInvoicesByRoom, compareRooms } from './roomOrder'
import type { Invoice, Room } from './types'

function room(name: string, order: number): Room {
  return {
    id: name,
    name,
    order,
    electricPrice: 0,
    waterPrice: 0,
    garbageFee: 0,
    extraFees: [],
    defaultRent: 0,
    defaultDeposit: 0,
    defaultCycleDay: 1,
  }
}

function invoice(roomId: string, issueDate: string, createdAt = issueDate): Invoice {
  return {
    id: `${roomId}-${issueDate}`,
    roomId,
    tenancyId: 't1',
    code: 'X',
    kind: 'monthly',
    issueDate,
    createdAt,
    lines: [],
    total: 0,
    payments: [],
  }
}

describe('compareRooms', () => {
  it('sorts by order then numeric name', () => {
    const rooms = [room('Phòng 10', 2), room('Phòng 02', 1), room('Nhà Trước', 0)]
    rooms.sort(compareRooms)
    expect(rooms.map((r) => r.name)).toEqual(['Nhà Trước', 'Phòng 02', 'Phòng 10'])
  })
})

describe('compareInvoicesByRoom', () => {
  const roomById = new Map([
    [room('Phòng 02', 1).id, room('Phòng 02', 1)],
    [room('Phòng 10', 2).id, room('Phòng 10', 2)],
  ])

  it('sorts by room order before issue date', () => {
    const items = [
      invoice('Phòng 10', '2026-09-02'),
      invoice('Phòng 02', '2026-09-01'),
    ]
    items.sort((a, b) => compareInvoicesByRoom(a, b, roomById, 'desc'))
    expect(items.map((i) => i.roomId)).toEqual(['Phòng 02', 'Phòng 10'])
  })
})
