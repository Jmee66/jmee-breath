import { db, type SyncQueueEntry } from '../db/apneaDb'
import { supabase } from '../supabase/client'
import { eventBus } from '../events/eventBus'
import type { Exercise, Session, FreeTimerSession } from '../types'

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
      const now = new Date().toISOString()
      if (entry.table === 'sessions') {
        await db.sessions.update(entry.recordId, { syncedAt: now })
      } else if (entry.table === 'free_timer_sessions') {
        await db.freeTimerSessions.update(entry.recordId, { syncedAt: now })
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
    const lastSession = await db.sessions.orderBy('completedAt').last()
    const sessionQuery = lastSession
      ? supabase.from('sessions').select('*').eq('user_id', this.userId).gt('completed_at', lastSession.completedAt)
      : supabase.from('sessions').select('*').eq('user_id', this.userId)

    const { data: remoteSessions } = await sessionQuery
    if (remoteSessions?.length) {
      for (const s of remoteSessions) {
        await db.sessions.put(mapRemoteSession(s))
      }
      eventBus.emit('SYNC_COMPLETED', { table: 'sessions', pushed: 0, pulled: remoteSessions.length })
    }

    // Pull exercices custom (is_preset = false)
    const { data: remoteExercises } = await supabase
      .from('exercises').select('*').eq('user_id', this.userId).eq('is_preset', false)
    if (remoteExercises?.length) {
      for (const e of remoteExercises) {
        const local = await db.exercises.get(e.id)
        if (!local || new Date(e.updated_at) > new Date(local.updatedAt)) {
          await db.exercises.put(mapRemoteExercise(e))
        }
      }
      eventBus.emit('SYNC_COMPLETED', { table: 'exercises', pushed: 0, pulled: remoteExercises.length })
    }

    // Pull free timer sessions
    const lastFts = await db.freeTimerSessions.orderBy('startedAt').last()
    const ftsQuery = lastFts
      ? supabase.from('free_timer_sessions').select('*').eq('user_id', this.userId).gt('started_at', lastFts.startedAt)
      : supabase.from('free_timer_sessions').select('*').eq('user_id', this.userId)
    const { data: remoteFts } = await ftsQuery
    if (remoteFts?.length) {
      for (const s of remoteFts) {
        await db.freeTimerSessions.put(mapRemoteFreeTimerSession(s))
      }
      eventBus.emit('SYNC_COMPLETED', { table: 'free_timer_sessions', pushed: 0, pulled: remoteFts.length })
    }
  }

  /**
   * Sync forcée bidirectionnelle — point de départ commun pour tous les appareils.
   *
   * 1. Push : envoie tout le contenu local non encore dans Supabase
   * 2. Pull : récupère tout depuis Supabase (sans filtre de date)
   * 3. Émet SYNC_COMPLETED pour chaque table touchée
   */
  async forceSync(): Promise<{ pushed: number; pulled: number }> {
    if (!this.userId) return { pushed: 0, pulled: 0 }
    const uid = this.userId
    let pushed = 0
    let pulled = 0

    // ── 1. Push exercices custom ────────────────────────────────────────────
    const localExercises = await db.exercises.filter((e) => !e.isPreset).toArray()
    if (localExercises.length) {
      const payloads = localExercises.map((e) => exerciseToSupabase(e, uid))
      const { error } = await supabase.from('exercises').upsert(payloads)
      if (!error) {
        pushed += localExercises.length
      }
    }

    // ── 2. Push sessions ────────────────────────────────────────────────────
    const localSessions = await db.sessions.toArray()
    if (localSessions.length) {
      const payloads = localSessions.map((s) => sessionToSupabase(s, uid))
      const { error } = await supabase.from('sessions').upsert(payloads)
      if (!error) {
        pushed += localSessions.length
        await db.sessions.toCollection().modify({ syncedAt: new Date().toISOString() })
      }
    }

    // ── 3. Push free_timer_sessions ─────────────────────────────────────────
    const localFts = await db.freeTimerSessions.toArray()
    if (localFts.length) {
      const payloads = localFts.map((s) => ftsToSupabase(s, uid))
      const { error } = await supabase.from('free_timer_sessions').upsert(payloads)
      if (!error) {
        pushed += localFts.length
        await db.freeTimerSessions.toCollection().modify({ syncedAt: new Date().toISOString() })
      }
    }

    // ── 4. Push préférences ─────────────────────────────────────────────────
    //    (déjà géré par usePreferencesSync, on flush juste la queue)
    await this.flush()

    // ── 5. Pull complet exercices (sans filtre de date) ─────────────────────
    const { data: remoteEx } = await supabase
      .from('exercises').select('*').eq('user_id', uid).eq('is_preset', false)
    if (remoteEx?.length) {
      for (const e of remoteEx) {
        const local = await db.exercises.get(e.id)
        if (!local || new Date(e.updated_at) > new Date(local.updatedAt)) {
          await db.exercises.put(mapRemoteExercise(e))
        }
      }
      pulled += remoteEx.length
      eventBus.emit('SYNC_COMPLETED', { table: 'exercises', pushed: 0, pulled: remoteEx.length })
    }

    // ── 6. Pull complet sessions (sans filtre de date) ──────────────────────
    const { data: remoteSessions } = await supabase
      .from('sessions').select('*').eq('user_id', uid)
    if (remoteSessions?.length) {
      for (const s of remoteSessions) {
        await db.sessions.put(mapRemoteSession(s))
      }
      pulled += remoteSessions.length
      eventBus.emit('SYNC_COMPLETED', { table: 'sessions', pushed: 0, pulled: remoteSessions.length })
    }

    // ── 7. Pull complet free_timer_sessions ─────────────────────────────────
    const { data: remoteFts } = await supabase
      .from('free_timer_sessions').select('*').eq('user_id', uid)
    if (remoteFts?.length) {
      for (const s of remoteFts) {
        await db.freeTimerSessions.put(mapRemoteFreeTimerSession(s))
      }
      pulled += remoteFts.length
      eventBus.emit('SYNC_COMPLETED', { table: 'free_timer_sessions', pushed: 0, pulled: remoteFts.length })
    }

    return { pushed, pulled }
  }
}

// ── Mappers remote → local (snake_case → camelCase) ───────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRemoteSession(r: any): Session {
  return {
    ...r,
    exerciseId:       r.exercise_id,
    exerciseSnapshot: r.exercise_snapshot,
    startedAt:        r.started_at,
    completedAt:      r.completed_at,
    durationSeconds:  r.duration_seconds,
    repsCompleted:    r.reps_completed,
    totalReps:        r.total_reps,
    phasesLog:        r.phases_log,
    syncedAt:         new Date().toISOString(),
    localOnly:        false,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRemoteExercise(r: any): Exercise {
  return {
    ...r,
    isPreset:               r.is_preset,
    createdAt:              r.created_at,
    updatedAt:              r.updated_at,
    restBetweenRepsSeconds: r.rest_between_reps_seconds,
    customPresets:          r.custom_presets ?? [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRemoteFreeTimerSession(r: any): FreeTimerSession {
  return {
    id:              r.id,
    startedAt:       r.started_at,
    completedAt:     r.completed_at  ?? null,
    durationSeconds: r.duration_seconds ?? 0,
    laps:            r.laps           ?? [],
    notes:           r.notes          ?? '',
    mode:            r.mode           ?? 'apnea',
    syncedAt:        new Date().toISOString(),
  }
}

// ── Mappers local → remote (camelCase → snake_case) ───────────────────────────

function exerciseToSupabase(e: Exercise, userId: string): Record<string, unknown> {
  return {
    id:                        e.id,
    user_id:                   userId,
    name:                      e.name,
    description:               e.description,
    category:                  e.category,
    difficulty:                e.difficulty,
    tags:                      e.tags,
    phases:                    e.phases,
    repetitions:               e.repetitions,
    rest_between_reps_seconds: e.restBetweenRepsSeconds,
    is_preset:                 false,
    custom_presets:            e.customPresets ?? [],
    created_at:                e.createdAt,
    updated_at:                e.updatedAt,
  }
}

function sessionToSupabase(s: Session, userId: string): Record<string, unknown> {
  return {
    id:                s.id,
    user_id:           userId,
    exercise_id:       s.exerciseId,
    exercise_snapshot: s.exerciseSnapshot,
    started_at:        s.startedAt,
    completed_at:      s.completedAt,
    duration_seconds:  s.durationSeconds,
    reps_completed:    s.repsCompleted,
    total_reps:        s.totalReps,
    phases_log:        s.phasesLog,
    notes:             s.notes,
    abandoned:         s.abandoned,
  }
}

function ftsToSupabase(s: FreeTimerSession, userId: string): Record<string, unknown> {
  return {
    id:               s.id,
    user_id:          userId,
    started_at:       s.startedAt,
    completed_at:     s.completedAt,
    duration_seconds: s.durationSeconds,
    laps:             s.laps,
    notes:            s.notes,
    mode:             s.mode,
  }
}

// Dexie keys pour les requêtes composites
import Dexie from 'dexie'

export const syncManager = new SyncManager()
