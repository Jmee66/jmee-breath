import { db } from '@core/db/apneaDb'
import type { ApneaTable } from '../types'

export const tableRepository = {
  getAll: () => db.apneaTables.orderBy('createdAt').reverse().toArray(),
  getById: (id: string) => db.apneaTables.get(id),
  save:   (table: ApneaTable) => db.apneaTables.put(table),
  delete: (id: string) => db.apneaTables.delete(id),
}
