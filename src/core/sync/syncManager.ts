import { db, type SyncQueueEntry } from '../db/apneaDb'
import { supabase } from '../supabase/client'
import { eventBus } from '../events/eventBus'

const MAX_RETRIES = 5
const BATCH_SIZE = 50

/**
 * Gestionnaire de synchronisation offline → Supabase.
 *
 * Stratégie :
 * - Toutes les écritures passent d'abord par IndexedDB
 * - SyncManager pousse en arrière-plan quand on est online
 * - En cas d'erreur réseau : retry exponentiel (max 5 fois)
 * - Pull depuis Supabase au démarrage et lors du retour online
 */
class SyncManager {
  private isOnline = navigator.onLine
  private isFlushing = false
  private userId: string | null = null

  constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true
      void this.flush()
    })
    window.addEventListener('offline', () => {
      this.isOnline = false
    })
  }

  setUserId(userId: string | null): void {
    this.userId = userId
    if (userId && this.isOnline) {
      void this.pull()
      void this.flush()
    }
  }

  async enqueue(
    entry: Omit<SyncQueueEntry, 'id' | 'status' | 'retryCount'>,
  ): Promise<void> {
    await db.syncQueue.add({
      ...entry,
      status: 'pending',
      retryCount: 0,
    })
    if (this.isOnline && this.userId) {
      void this.flush()
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || !this.userId) return
    this.isFlushing = true

    try {
      const pending = await db.syncQueue
        .where('[status+createdAt]')
        .between(['pending', Dexie.minKey], ['pending', Dexie.maxKey])
        .limit(BATCH_SIZE)
        .toArray()

      for (const entry of pending) {
        await this.processEntry(entry)
      }
    } finally {
      this.isFlushing = false
    }
  }

  private async processEntry(entry: SyncQueueEntry): Promise<void> {
    if (!entry.id) return

    await db.syncQueue.update(entry.id, { status: 'in-flight' })

    try {
      if (entry.operation === 'upsert') {
        const { error } = await supabase
          .from(entry.table)
          .upsert(entry.payload as Record<string, unknown>)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from(entry.table)
          .delete()
          .eq('id', entry.recordId)
        if (error) throw error
      }

      await db.syncQueue.delete(entry.id)

      // Marquer l'enregistrement comme synchronisé
      if (entry.table === 'sessions') {
        await db.sessions.update(entry.recordId, {
          syncedAt: new Date().toISOString(),
        })
      }

      eventBus.emit('SYNC_COMPLETED', {
        table: entry.table,
        pushed: 1,
        pulled: 0,
      })
    } catch (err) {
      const newRetryCount = entry.retryCount + 1
      if (newRetryCount >= MAX_RETRIES) {
        await db.syncQueue.update(entry.id, {
          status: 'failed',
          retryCount: newRetryCount,
          error: err instanceof Error ? err.message : String(err),
        })
        eventBus.emit('SYNC_FAILED', {
          table: entry.table,
          error: err instanceof Error ? err.message : String(err),
        })
      } else {
        await db.syncQueue.update(entry.id, {
          status: 'pending',
          retryCount: newRetryCount,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  async pull(): Promise<void> {
    if (!this.userId) return

    // Pull sessions
    const lastSession = await db.sessions
      .orderBy('completedAt')
      .last()

    const sessionQuery = lastSession
      ? supabase
          .from('sessions')
          .select('*')
          .eq('user_id', this.userId)
          .gt('completed_at', lastSession.completedAt)
      : supabase
          .from('sessions')
          .select('*')
          .eq('user_id', this.userId)

    const { data: remoteSessions } = await sessionQuery
    if (remoteSessions?.length) {
      for (const s of remoteSessions) {
        await db.sessions.put(mapRemoteSession(s))
      }
      eventBus.emit('SYNC_COMPLETED', {
        table: 'sessions',
        pushed: 0,
        pulled: remoteSessions.length,
      })
    }

    // Pull exercices custom (is_preset = false)
    const { data: remoteExercises } = await supabase
      .from('exercises')
      .select('*')
      .eq('user_id', this.userId)
      .eq('is_preset', false)

    if (remoteExercises?.length) {
      for (const e of remoteExercises) {
        const local = await db.exercises.get(e.id)
        if (!local || new Date(e.updated_at) > new Date(local.updatedAt)) {
          await db.exercises.put(mapRemoteExercise(e))
        }
      }
      eventBus.emit('SYNC_COMPLETED', {
        table: 'exercises',
        pushed: 0,
        pulled: remoteExercises.length,
      })
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRemoteSession(r: any) {
  return {
    ...r,
    exerciseId: r.exercise_id,
    exerciseSnapshot: r.exercise_snapshot,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationSeconds: r.duration_seconds,
    repsCompleted: r.reps_completed,
    totalReps: r.total_reps,
    phasesLog: r.phases_log,
    syncedAt: new Date().toISOString(),
    localOnly: false,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRemoteExercise(r: any) {
  return {
    ...r,
    isPreset: r.is_preset,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    restBetweenRepsSeconds: r.rest_between_reps_seconds,
  }
}

// Dexie keys pour les requêtes composites
import Dexie from 'dexie'

export const syncManager = new SyncManager()
