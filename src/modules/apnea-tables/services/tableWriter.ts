import { db } from '@core/db/apneaDb'
import { syncManager } from '@core/sync/syncManager'
import { useAuthStore } from '@modules/auth/store/authStore'
import { uuid } from '@core/utils/uuid'
import type { ApneaTable } from '../types'

function toSupabasePayload(t: ApneaTable, userId: string): Record<string, unknown> {
  return {
    id:                   t.id,
    user_id:              userId,
    name:                 t.name,
    type:                 t.type,
    rows:                 t.rows,
    reference_max_s:      t.referenceMaxS,
    series_count:         Math.round(t.seriesCount),
    recovery_pattern:     t.recoveryPattern,
    forme_factor:         t.formeFactor,
    custom_program:       t.customProgram       ?? null,
    custom_phases:        t.customPhases        ?? null,
    custom_series_count:  t.customSeriesCount != null ? Math.round(t.customSeriesCount) : null,
    description:          t.description         ?? null,
    recovery_note:        t.recoveryNote        ?? null,
    category:             t.category            ?? null,
    created_at:           t.createdAt,
    updated_at:           t.updatedAt,
  }
}

export const tableWriter = {
  async save(
    data: Omit<ApneaTable, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>,
    existingId?: string,
  ): Promise<ApneaTable> {
    const now = new Date().toISOString()
    const table: ApneaTable = {
      ...data,
      id:        existingId ?? uuid(),
      createdAt: existingId ? ((await db.apneaTables.get(existingId))?.createdAt ?? now) : now,
      updatedAt: now,
      syncedAt:  null,
    }
    await db.apneaTables.put(table)
    const userId = useAuthStore.getState().user?.id
    if (userId) {
      await syncManager.enqueue({
        table:     'apnea_tables',
        operation: 'upsert',
        recordId:  table.id,
        payload:   toSupabasePayload(table, userId),
        createdAt: now,
      })
    }
    return table
  },

  async delete(id: string): Promise<void> {
    await db.apneaTables.delete(id)
    const userId = useAuthStore.getState().user?.id
    if (userId) {
      await syncManager.enqueue({
        table:     'apnea_tables',
        operation: 'delete',
        recordId:  id,
        payload:   { id },
        createdAt: new Date().toISOString(),
      })
    }
  },
}
