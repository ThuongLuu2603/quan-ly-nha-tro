import { useLiveQuery } from 'dexie-react-hooks'
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
    rooms.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi'))
    invoices.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.createdAt.localeCompare(a.createdAt))
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
