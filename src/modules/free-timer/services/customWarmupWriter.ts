import { db } from '@core/db'
import { syncManager } from '@core/sync'
import { useAuthStore } from '@modules/auth/store/authStore'
import type { CustomWarmup } from '../types'

function toSupabasePayload(w: CustomWarmup, userId: string): Record<string, unknown> {
  return {
    id:                    w.id,
    user_id:               userId,
    name:                  w.name,
    category:              w.category ?? null,
    steps:                 w.steps,
    go_duration_s:         w.goDurationS,
    recovery_pattern:      w.recoveryPattern,
    recovery_duration_s:   w.recoveryDurationS,
    recovery_instruction:  w.recoveryInstruction,
    created_at:            w.createdAt,
    updated_at:            w.updatedAt,
  }
}

export async function getAllCustomWarmups(): Promise<CustomWarmup[]> {
  return db.customWarmups.orderBy('createdAt').reverse().toArray()
}

export async function saveCustomWarmup(warmup: CustomWarmup): Promise<void> {
  await db.customWarmups.put(warmup)
  const userId = useAuthStore.getState().user?.id
  if (userId) {
    await syncManager.enqueue({
      table:     'custom_warmups',
      operation: 'upsert',
      recordId:  warmup.id,
      payload:   toSupabasePayload(warmup, userId),
      createdAt: new Date().toISOString(),
    })
  }
}

export async function deleteCustomWarmup(id: string): Promise<void> {
  await db.customWarmups.delete(id)
  const userId = useAuthStore.getState().user?.id
  if (userId) {
    await syncManager.enqueue({
      table:     'custom_warmups',
      operation: 'delete',
      recordId:  id,
      payload:   null,
      createdAt: new Date().toISOString(),
    })
  }
}
