import { useLiveQuery } from 'dexie-react-hooks'
import { compareInvoicesByRoom, compareRooms, buildRoomById } from '../domain/roomOrder'
import type { Invoice, Reading, Room, Settings, Tenancy, Tenant } from '../domain/types'
import { DEFAULT_SETTINGS, db } from './db'

export interface Dataset {
  rooms: Room[]
  tenancies: Tenancy[]
  tenants: Tenant[]
  readings: Reading[]
  invoices: Invoice[]
  settings: Settings
  ready: boolean
}

const EMPTY: Dataset = {
  rooms: [],
  tenancies: [],
  tenants: [],
  readings: [],
  invoices: [],
  settings: DEFAULT_SETTINGS,
  ready: false,
}

export function useDataset(): Dataset {
  const data = useLiveQuery(async () => {
    const [rooms, tenancies, tenants, readings, invoices, settings] = await Promise.all([
      db.rooms.toArray(),
      db.tenancies.toArray(),
      db.tenants.toArray(),
      db.readings.toArray(),
      db.invoices.toArray(),
      db.settings.get('app'),
    ])
    rooms.sort(compareRooms)
    const roomById = buildRoomById(rooms)
    invoices.sort((a, b) => compareInvoicesByRoom(a, b, roomById, 'desc'))
    return {
      rooms,
      tenancies,
      tenants,
      readings,
      invoices,
      settings: settings ?? DEFAULT_SETTINGS,
      ready: true,
    } satisfies Dataset
  }, [])

  return data ?? EMPTY
}
