import { db } from '@core/db'
import { eventBus } from '@core/events'
import { syncManager } from '@core/sync'
import type { Session } from '@core/types'
import { useJournalStore } from '../store/journalStore'

/** Écoute SESSION_COMPLETED et persiste automatiquement */
export function initSessionWriter(): () => void {
  return eventBus.on('SESSION_COMPLETED', (payload) => {
    const session: Session = {
      id: payload.sessionId,
      exerciseId: payload.exerciseId,
      exerciseSnapshot: payload.exercise,
      startedAt: new Date(
        Date.now() - payload.durationSeconds * 1000,
      ).toISOString(),
      completedAt: payload.completedAt,
      durationSeconds: payload.durationSeconds,
      repsCompleted: payload.repsCompleted,
      totalReps: payload.totalReps,
      phasesLog: payload.phasesLog,
      notes: '',
      abandoned: payload.abandoned,
      syncedAt: null,
      localOnly: false,
    }

    void (async () => {
      const id = await db.sessions.put(session)
      useJournalStore.getState().addSession(session)

      await syncManager.enqueue({
        table: 'sessions',
        operation: 'upsert',
        recordId: session.id,
        payload: session,
        createdAt: new Date().toISOString(),
      })

      eventBus.emit('JOURNAL_UPDATED', {
        sessionId: session.id,
        localDbId: typeof id === 'number' ? id : 0,
      })
    })()
  })
}

export async function getRecentSessions(limit = 20): Promise<Session[]> {
  return db.sessions
    .orderBy('completedAt')
    .reverse()
    .limit(limit)
    .toArray()
}
