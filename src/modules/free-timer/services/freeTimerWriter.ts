import { db } from '@core/db'
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
