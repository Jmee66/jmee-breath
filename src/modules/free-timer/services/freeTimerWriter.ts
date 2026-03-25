import { db } from '@core/db'
import { syncManager } from '@core/sync'
import { useAuthStore } from '@modules/auth/store/authStore'
import type { FreeTimerSession } from '@core/types'
import { useFreeTimerStore } from '../store/freeTimerStore'

export async function saveFreeTimerSession(
  startedAt:       string,
  durationSeconds: number,
  lapsSeconds:     number[],
  notes            = '',
  mode:            'apnea' | 'free' = 'apnea',
): Promise<FreeTimerSession> {
  const session: FreeTimerSession = {
    id:              crypto.randomUUID(),
    startedAt,
    completedAt:     new Date().toISOString(),
    durationSeconds,
    laps:            lapsSeconds,
    notes,
    syncedAt:        null,
    mode,
  }
  await db.freeTimerSessions.put(session)
  useFreeTimerStore.getState().addSession(session)

  const userId = useAuthStore.getState().user?.id
  if (userId) {
    await syncManager.enqueue({
      table:     'free_timer_sessions',
      operation: 'upsert',
      recordId:  session.id,
      payload: {
        id:               session.id,
        user_id:          userId,
        started_at:       session.startedAt,
        completed_at:     session.completedAt,
        duration_seconds: session.durationSeconds,
        laps:             session.laps,
        notes:            session.notes,
        mode:             session.mode,
      },
      createdAt: new Date().toISOString(),
    })
  }

  return session
}

export async function getFreeTimerSessions(limit = 50): Promise<FreeTimerSession[]> {
  return db.freeTimerSessions
    .orderBy('completedAt')
    .reverse()
    .limit(limit)
    .toArray()
}

/** Retourne la session avec la plus longue durée enregistrée */
export async function getBestFreeTimerSession(): Promise<FreeTimerSession | null> {
  const all = await db.freeTimerSessions.toArray()
  if (all.length === 0) return null
  return all.reduce((best, s) =>
    s.durationSeconds > best.durationSeconds ? s : best
  )
}
