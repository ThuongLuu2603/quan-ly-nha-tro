import { useLiveQuery } from 'dexie-react-hooks'
import { compareInvoicesByRoom, compareRooms, buildRoomById } from '../domain/roomOrder'
import type { Expense, Invoice, Reading, Room, Settings, Tenancy, Tenant } from '../domain/types'
import { DEFAULT_SETTINGS, db } from './db'

export interface Dataset {
  rooms: Room[]
  tenancies: Tenancy[]
  tenants: Tenant[]
  readings: Reading[]
  invoices: Invoice[]
  expenses: Expense[]
  settings: Settings
  ready: boolean
}

const EMPTY: Dataset = {
  rooms: [],
  tenancies: [],
  tenants: [],
  readings: [],
  invoices: [],
  expenses: [],
  settings: DEFAULT_SETTINGS,
  ready: false,
}

export function useDataset(): Dataset {
  const data = useLiveQuery(async () => {
    const [rooms, tenancies, tenants, readings, invoices, expenses, settings] = await Promise.all([
      db.rooms.toArray(),
      db.tenancies.toArray(),
      db.tenants.toArray(),
      db.readings.toArray(),
      db.invoices.toArray(),
      db.expenses.toArray(),
      db.settings.get('app'),
    ])
    rooms.sort(compareRooms)
    const roomById = buildRoomById(rooms)
    invoices.sort((a, b) => compareInvoicesByRoom(a, b, roomById, 'desc'))
    expenses.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return b.createdAt.localeCompare(a.createdAt)
    })
    return {
      rooms,
      tenancies,
      tenants,
      readings,
      invoices,
      expenses,
      settings: settings ?? DEFAULT_SETTINGS,
      ready: true,
    } satisfies Dataset
  }, [])

  return data ?? EMPTY
}
