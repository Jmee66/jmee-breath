import { nanoid } from 'nanoid'
import { db } from '@core/db/apneaDb'
import { syncManager } from '@core/sync/syncManager'
import { useAuthStore } from '@modules/auth/store/authStore'
import type { ApneaTable } from '../types'

function toSupabasePayload(t: ApneaTable, userId: string): Record<string, unknown> {
  return {
    id:               t.id,
    user_id:          userId,
    name:             t.name,
    type:             t.type,
    rows:             JSON.stringify(t.rows),
    reference_max_s:  t.referenceMaxS,
    series_count:     t.seriesCount,
    recovery_pattern: t.recoveryPattern,
    forme_factor:     t.formeFactor,
    created_at:       t.createdAt,
    updated_at:       t.updatedAt,
  }
}

export const tableWriter = {
  async save(
    data: Omit<ApneaTable, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>,
    existingId?: string,
  ): Promise<ApneaTable> {
    const now   = new Date().toISOString()
    const table: ApneaTable = {
      ...data,
      id:        existingId ?? nanoid(),
      createdAt: existingId ? (await db.apneaTables.get(existingId))?.createdAt ?? now : now,
      updatedAt: now,
      syncedAt:  null,
    }
    await db.apneaTables.put(table)
    const userId = useAuthStore.getState().user?.id
    if (userId) {
      syncManager.enqueue('upsert', 'apnea_tables', table.id, toSupabasePayload(table, userId))
    }
    return table
  },

  async delete(id: string): Promise<void> {
    await db.apneaTables.delete(id)
    const userId = useAuthStore.getState().user?.id
    if (userId) {
      syncManager.enqueue('delete', 'apnea_tables', id, { id })
    }
  },
}
