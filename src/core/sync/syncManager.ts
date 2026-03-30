import { db, type SyncQueueEntry } from '../db/apneaDb'
import { supabase } from '../supabase/client'
import { eventBus } from '../events/eventBus'
import type { Exercise, Session, FreeTimerSession } from '../types'
import type { CustomWarmup } from '@modules/free-timer/types'
import type { ApneaTable } from '@modules/apnea-tables/types'
import { enqueuePreferencesNow } from './preferencesSync'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private realtimeChannel: any = null

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
      this.subscribeRealtime(userId)
    } else {
      this.unsubscribeRealtime()
    }
  }

  /** Abonnement Realtime Supabase — les tables créées sur d'autres appareils arrivent automatiquement. */
  private subscribeRealtime(userId: string): void {
    this.unsubscribeRealtime()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleRealtimeEvent = (table: string, mapper: (r: any) => any, dbTable: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (payload: any) => {
        try {
          if (payload.eventType === 'DELETE') {
            if (payload.old?.id) {
              await dbTable.delete(payload.old.id as string)
              eventBus.emit('SYNC_COMPLETED', { table, pushed: 0, pulled: 1 })
            }
          } else if (payload.new) {
            await dbTable.put(mapper(payload.new))
            eventBus.emit('SYNC_COMPLETED', { table, pushed: 0, pulled: 1 })
          }
        } catch {
          // Silencieux — sera rattrapé au prochain pull
        }
      }

    this.realtimeChannel = supabase
      .channel(`sync-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'apnea_tables', filter: `user_id=eq.${userId}` },
        handleRealtimeEvent('apnea_tables', mapRemoteApneaTable, db.apneaTables),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exercises', filter: `user_id=eq.${userId}` },
        handleRealtimeEvent('exercises', mapRemoteExercise, db.exercises),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'custom_warmups', filter: `user_id=eq.${userId}` },
        handleRealtimeEvent('custom_warmups', mapRemoteCustomWarmup, db.customWarmups),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `user_id=eq.${userId}` },
        handleRealtimeEvent('sessions', mapRemoteSession, db.sessions),
      )
      .subscribe()
  }

  private unsubscribeRealtime(): void {
    if (this.realtimeChannel) {
      void supabase.removeChannel(this.realtimeChannel)
      this.realtimeChannel = null
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
      } else if (entry.table === 'custom_warmups') {
        await db.customWarmups.update(entry.recordId, { syncedAt: now })
      } else if (entry.table === 'apnea_tables') {
        await db.apneaTables.update(entry.recordId, { syncedAt: now })
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

    // Helper — pull sécurisé avec try/catch par table
    const safePull = async (table: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (err) {
        eventBus.emit('SYNC_FAILED', { table, error: err instanceof Error ? err.message : String(err) })
      }
    }

    // Pull sessions
    await safePull('sessions', async () => {
      const lastSession = await db.sessions.orderBy('completedAt').last()
      const sessionQuery = lastSession
        ? supabase.from('sessions').select('*').eq('user_id', this.userId!).gte('completed_at', lastSession.completedAt)
        : supabase.from('sessions').select('*').eq('user_id', this.userId!)

      const { data, error } = await sessionQuery
      if (error) throw error
      if (data?.length) {
        for (const s of data) {
          await db.sessions.put(mapRemoteSession(s))
        }
        eventBus.emit('SYNC_COMPLETED', { table: 'sessions', pushed: 0, pulled: data.length })
      }
    })

    // Pull exercices custom (is_preset = false)
    await safePull('exercises', async () => {
      const { data, error } = await supabase
        .from('exercises').select('*').eq('user_id', this.userId!).eq('is_preset', false)
      if (error) throw error
      if (data?.length) {
        for (const e of data) {
          const local = await db.exercises.get(e.id)
          if (!local || new Date(e.updated_at) > new Date(local.updatedAt)) {
            await db.exercises.put(mapRemoteExercise(e))
          }
        }
        eventBus.emit('SYNC_COMPLETED', { table: 'exercises', pushed: 0, pulled: data.length })
      }
    })

    // Pull free timer sessions
    await safePull('free_timer_sessions', async () => {
      const lastFts = await db.freeTimerSessions.orderBy('startedAt').last()
      const ftsQuery = lastFts
        ? supabase.from('free_timer_sessions').select('*').eq('user_id', this.userId!).gte('started_at', lastFts.startedAt)
        : supabase.from('free_timer_sessions').select('*').eq('user_id', this.userId!)
      const { data, error } = await ftsQuery
      if (error) throw error
      if (data?.length) {
        for (const s of data) {
          await db.freeTimerSessions.put(mapRemoteFreeTimerSession(s))
        }
        eventBus.emit('SYNC_COMPLETED', { table: 'free_timer_sessions', pushed: 0, pulled: data.length })
      }
    })

    // Pull custom warmups (avec conflit résolu par updated_at)
    await safePull('custom_warmups', async () => {
      const { data, error } = await supabase
        .from('custom_warmups').select('*').eq('user_id', this.userId!)
      if (error) throw error
      if (data?.length) {
        for (const w of data) {
          const local = await db.customWarmups.get(w.id)
          if (!local || new Date(w.updated_at) > new Date(local.updatedAt)) {
            await db.customWarmups.put(mapRemoteCustomWarmup(w))
          }
        }
        eventBus.emit('SYNC_COMPLETED', { table: 'custom_warmups', pushed: 0, pulled: data.length })
      }
    })

    // Pull apnea tables (avec conflit résolu par updated_at)
    await safePull('apnea_tables', async () => {
      const { data, error } = await supabase
        .from('apnea_tables').select('*').eq('user_id', this.userId!)
      if (error) throw error
      if (data?.length) {
        for (const t of data) {
          const local = await db.apneaTables.get(t.id)
          if (!local || new Date(t.updated_at) > new Date(local.updatedAt)) {
            await db.apneaTables.put(mapRemoteApneaTable(t))
          }
        }
        eventBus.emit('SYNC_COMPLETED', { table: 'apnea_tables', pushed: 0, pulled: data.length })
      }
    })
  }

  /**
   * Sync forcée bidirectionnelle — point de départ commun pour tous les appareils.
   *
   * 1. Push : envoie tout le contenu local non encore dans Supabase
   * 2. Pull : récupère tout depuis Supabase (sans filtre de date)
   * 3. Émet SYNC_COMPLETED pour chaque table touchée
   */
  async forceSync(): Promise<{ pushed: number; pulled: number; details: string[] }> {
    if (!this.userId) {
      console.warn('[sync] forceSync called but no userId')
      return { pushed: 0, pulled: 0, details: ['Pas connecté'] }
    }
    const uid = this.userId
    console.log('[sync] forceSync start — userId:', uid)
    let pushed = 0
    let pulled = 0
    const details: string[] = []

    // ── 1. Push exercices custom ────────────────────────────────────────────
    const localExercises = await db.exercises.filter((e) => !e.isPreset).toArray()
    console.log('[sync] push exercises:', localExercises.length)
    if (localExercises.length) {
      const payloads = localExercises.map((e) => exerciseToSupabase(e, uid))
      const { error } = await supabase.from('exercises').upsert(payloads)
      if (error) { console.error('[sync] push exercises ERROR:', error.message); details.push(`Ex push ERR: ${error.message}`) }
      else { pushed += localExercises.length; details.push(`Ex push: ${localExercises.length}`) }
    }

    // ── 2. Push sessions ────────────────────────────────────────────────────
    const localSessions = await db.sessions.toArray()
    console.log('[sync] push sessions:', localSessions.length)
    if (localSessions.length) {
      const payloads = localSessions.map((s) => sessionToSupabase(s, uid))
      const { error } = await supabase.from('sessions').upsert(payloads)
      if (error) { console.error('[sync] push sessions ERROR:', error.message); details.push(`Sess push ERR: ${error.message}`) }
      else {
        pushed += localSessions.length
        await db.sessions.toCollection().modify({ syncedAt: new Date().toISOString() })
      }
    }

    // ── 3. Push free_timer_sessions ─────────────────────────────────────────
    const localFts = await db.freeTimerSessions.toArray()
    console.log('[sync] push fts:', localFts.length)
    if (localFts.length) {
      const payloads = localFts.map((s) => ftsToSupabase(s, uid))
      const { error } = await supabase.from('free_timer_sessions').upsert(payloads)
      if (error) { console.error('[sync] push fts ERROR:', error.message); details.push(`FTS push ERR: ${error.message}`) }
      else {
        pushed += localFts.length
        await db.freeTimerSessions.toCollection().modify({ syncedAt: new Date().toISOString() })
      }
    }

    // ── 4. Push préférences (enqueue explicite + flush) ─────────────────────
    enqueuePreferencesNow(uid)
    await this.flush()

    // ── 5. Pull complet exercices (sans filtre de date) ─────────────────────
    const { data: remoteEx, error: exErr } = await supabase
      .from('exercises').select('*').eq('user_id', uid).eq('is_preset', false)
    console.log('[sync] pull exercises:', remoteEx?.length ?? 0, exErr?.message ?? 'OK')
    if (exErr) details.push(`Ex pull ERR: ${exErr.message}`)
    else if (remoteEx?.length) details.push(`Ex pull: ${remoteEx.length}`)
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
    const { data: remoteSessions, error: sessErr } = await supabase
      .from('sessions').select('*').eq('user_id', uid)
    console.log('[sync] pull sessions:', remoteSessions?.length ?? 0, sessErr?.message ?? 'OK')
    if (remoteSessions?.length) {
      for (const s of remoteSessions) {
        await db.sessions.put(mapRemoteSession(s))
      }
      pulled += remoteSessions.length
      eventBus.emit('SYNC_COMPLETED', { table: 'sessions', pushed: 0, pulled: remoteSessions.length })
    }

    // ── 7. Pull complet free_timer_sessions ─────────────────────────────────
    const { data: remoteFts2, error: ftsErr } = await supabase
      .from('free_timer_sessions').select('*').eq('user_id', uid)
    console.log('[sync] pull fts:', remoteFts2?.length ?? 0, ftsErr?.message ?? 'OK')
    if (remoteFts2?.length) {
      for (const s of remoteFts2) {
        await db.freeTimerSessions.put(mapRemoteFreeTimerSession(s))
      }
      pulled += remoteFts2.length
      eventBus.emit('SYNC_COMPLETED', { table: 'free_timer_sessions', pushed: 0, pulled: remoteFts2.length })
    }

    // ── 8. Push custom warmups ───────────────────────────────────────────────
    const localWarmups = await db.customWarmups.toArray()
    console.log('[sync] push warmups:', localWarmups.length)
    if (localWarmups.length) {
      const payloads = localWarmups.map((w) => customWarmupToSupabase(w, uid))
      const { error } = await supabase.from('custom_warmups').upsert(payloads)
      if (error) { console.error('[sync] push warmups ERROR:', error.message); details.push(`Warmup push ERR: ${error.message}`) }
      else {
        pushed += localWarmups.length
        await db.customWarmups.toCollection().modify({ syncedAt: new Date().toISOString() })
      }
    }

    // ── 9. Pull complet custom_warmups ───────────────────────────────────────
    const { data: remoteWarmups, error: wErr } = await supabase
      .from('custom_warmups').select('*').eq('user_id', uid)
    console.log('[sync] pull warmups:', remoteWarmups?.length ?? 0, wErr?.message ?? 'OK')
    if (wErr) details.push(`Warmup pull ERR: ${wErr.message}`)
    else if (remoteWarmups?.length) details.push(`Warmup pull: ${remoteWarmups.length}`)
    if (remoteWarmups?.length) {
      for (const w of remoteWarmups) {
        await db.customWarmups.put(mapRemoteCustomWarmup(w))
      }
      pulled += remoteWarmups.length
      eventBus.emit('SYNC_COMPLETED', { table: 'custom_warmups', pushed: 0, pulled: remoteWarmups.length })
    }

    // ── 10. Push apnea tables ────────────────────────────────────────────────
    const localTables = await db.apneaTables.toArray()
    console.log('[sync] push tables:', localTables.length)
    if (localTables.length) {
      const payloads = localTables.map((t) => apneaTableToSupabase(t, uid))
      const { error } = await supabase.from('apnea_tables').upsert(payloads)
      if (error) { console.error('[sync] push tables ERROR:', error.message); details.push(`Tables push ERR: ${error.message}`) }
      else {
        pushed += localTables.length
        await db.apneaTables.toCollection().modify({ syncedAt: new Date().toISOString() })
      }
    }

    // ── 11. Pull complet apnea tables ────────────────────────────────────────
    const { data: remoteTables, error: tErr } = await supabase
      .from('apnea_tables').select('*').eq('user_id', uid)
    console.log('[sync] pull tables:', remoteTables?.length ?? 0, tErr?.message ?? 'OK')
    if (tErr) details.push(`Tables pull ERR: ${tErr.message}`)
    else if (remoteTables?.length) details.push(`Tables pull: ${remoteTables.length}`)
    if (remoteTables) {
      const remoteIds = new Set(remoteTables.map((t: any) => t.id as string))
      for (const t of remoteTables) {
        const local = await db.apneaTables.get(t.id)
        if (!local || new Date(t.updated_at) > new Date(local.updatedAt)) {
          await db.apneaTables.put(mapRemoteApneaTable(t))
        }
      }
      // Supprimer les tables locales absentes du remote (supprimées sur un autre device)
      const localTableIds = await db.apneaTables.toCollection().primaryKeys()
      let deletedTables = 0
      for (const id of localTableIds) {
        if (!remoteIds.has(id as string)) {
          await db.apneaTables.delete(id)
          deletedTables++
        }
      }
      if (deletedTables) console.log('[sync] deleted orphan tables:', deletedTables)
      pulled += remoteTables.length
      if (remoteTables.length || deletedTables) {
        eventBus.emit('SYNC_COMPLETED', { table: 'apnea_tables', pushed: 0, pulled: remoteTables.length + deletedTables })
      }
    }

    // ── 12. Supprimer exercices locaux orphelins ────────────────────────────
    if (remoteEx) {
      const remoteExIds = new Set(remoteEx.map((e: any) => e.id as string))
      const localCustomExIds = (await db.exercises.filter(e => !e.isPreset).toArray()).map(e => e.id)
      for (const id of localCustomExIds) {
        if (!remoteExIds.has(id)) {
          await db.exercises.delete(id)
          console.log('[sync] deleted orphan exercise:', id)
        }
      }
    }

    // ── 13. Supprimer warmups locaux orphelins ──────────────────────────────
    if (remoteWarmups) {
      const remoteWarmupIds = new Set(remoteWarmups.map((w: any) => w.id as string))
      const localWarmupIds = await db.customWarmups.toCollection().primaryKeys()
      for (const id of localWarmupIds) {
        if (!remoteWarmupIds.has(id as string)) {
          await db.customWarmups.delete(id)
          console.log('[sync] deleted orphan warmup:', id)
        }
      }
    }

    console.log('[sync] forceSync done — pushed:', pushed, 'pulled:', pulled, 'details:', details)
    return { pushed, pulled, details }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRemoteCustomWarmup(r: any): CustomWarmup {
  return {
    id:                  r.id,
    name:                r.name,
    category:            r.category ?? undefined,
    steps:               r.steps ?? [],
    goDurationS:         r.go_duration_s ?? 3,
    recoveryPattern:     r.recovery_pattern ?? 'soupir',
    recoveryDurationS:   r.recovery_duration_s ?? 60,
    recoveryInstruction: r.recovery_instruction ?? '',
    createdAt:           r.created_at,
    updatedAt:           r.updated_at,
    syncedAt:            new Date().toISOString(),
  }
}

function customWarmupToSupabase(w: CustomWarmup, userId: string): Record<string, unknown> {
  return {
    id:                   w.id,
    user_id:              userId,
    name:                 w.name,
    category:             w.category ?? null,
    steps:                w.steps,
    go_duration_s:        w.goDurationS,
    recovery_pattern:     w.recoveryPattern,
    recovery_duration_s:  w.recoveryDurationS,
    recovery_instruction: w.recoveryInstruction,
    created_at:           w.createdAt,
    updated_at:           w.updatedAt,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRemoteApneaTable(r: any): ApneaTable {
  return {
    id:                 r.id,
    name:               r.name,
    type:               r.type,
    rows:               r.rows               ?? [],
    referenceMaxS:      r.reference_max_s    ?? 90,
    seriesCount:        r.series_count       ?? 8,
    recoveryPattern:    r.recovery_pattern   ?? 'soupir',
    formeFactor:        r.forme_factor       ?? 0,
    customProgram:      r.custom_program     ?? undefined,
    customPhases:       r.custom_phases      ?? undefined,
    customSeriesCount:  r.custom_series_count ?? undefined,
    description:        r.description        ?? undefined,
    recoveryNote:       r.recovery_note      ?? undefined,
    category:           r.category           ?? undefined,
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
    syncedAt:           new Date().toISOString(),
  }
}

function apneaTableToSupabase(t: ApneaTable, userId: string): Record<string, unknown> {
  return {
    id:                   t.id,
    user_id:              userId,
    name:                 t.name,
    type:                 t.type,
    rows:                 t.rows,
    reference_max_s:      t.referenceMaxS,
    series_count:         t.seriesCount,
    recovery_pattern:     t.recoveryPattern,
    forme_factor:         t.formeFactor,
    custom_program:       t.customProgram      ?? null,
    custom_phases:        t.customPhases       ?? null,
    custom_series_count:  t.customSeriesCount  ?? null,
    description:          t.description        ?? null,
    recovery_note:        t.recoveryNote       ?? null,
    category:             t.category           ?? null,
    created_at:           t.createdAt,
    updated_at:           t.updatedAt,
  }
}

// Dexie keys pour les requêtes composites
import Dexie from 'dexie'

export const syncManager = new SyncManager()
