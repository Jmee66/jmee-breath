import type { Exercise, PhaseType } from './exercise.types'
import type { PhaseLogEntry } from './session.types'

/**
 * Catalogue complet des événements inter-modules.
 * Ce fichier est le CONTRAT entre tous les modules.
 * Modifier un payload ici = TypeScript signalera chaque module impacté.
 */
export type AppEvent =
  // ── Module Exercises ─────────────────────────────────────────────────────
  | {
      type: 'EXERCISE_SELECTED'
      payload: {
        exerciseId: string
        /** Snapshot complet au moment de la sélection */
        exercise: Exercise
      }
    }

  // ── Module Breath Engine ──────────────────────────────────────────────────
  | {
      type: 'SESSION_STARTED'
      payload: {
        sessionId: string
        exerciseId: string
        /** Référence AudioContext.currentTime */
        startedAtAudio: number
        startedAt: string
      }
    }
  | {
      type: 'SESSION_PAUSED'
      payload: {
        sessionId: string
        pausedAt: number
      }
    }
  | {
      type: 'SESSION_RESUMED'
      payload: {
        sessionId: string
        resumedAt: number
      }
    }
  | {
      type: 'SESSION_COMPLETED'
      payload: {
        sessionId: string
        exerciseId: string
        exercise: Exercise
        durationSeconds: number
        repsCompleted: number
        totalReps: number
        phasesLog: PhaseLogEntry[]
        completedAt: string
        abandoned: boolean
      }
    }
  | {
      type: 'PHASE_CHANGED'
      payload: {
        sessionId: string
        phase: PhaseType
        phaseIndex: number
        repIndex: number
        durationSeconds: number
        /** AudioContext.currentTime quand la phase démarre */
        scheduledAt: number
      }
    }
  | {
      type: 'REP_COMPLETED'
      payload: {
        sessionId: string
        repIndex: number
        totalReps: number
      }
    }

  // ── Module Journal ────────────────────────────────────────────────────────
  | {
      type: 'JOURNAL_UPDATED'
      payload: {
        sessionId: string
        localDbId: number
      }
    }

  // ── Module Free Timer ─────────────────────────────────────────────────────
  | {
      type: 'TIMER_LAP'
      payload: {
        timerId: string
        lapIndex: number
        lapDurationSeconds: number
        totalElapsedSeconds: number
      }
    }
  | {
      type: 'TIMER_COMPLETED'
      payload: {
        timerId: string
        durationSeconds: number
        laps: number[]
      }
    }

  // ── Module Auth ───────────────────────────────────────────────────────────
  | {
      type: 'USER_SIGNED_IN'
      payload: {
        userId: string
        email: string
      }
    }
  | {
      type: 'USER_SIGNED_OUT'
      payload: Record<string, never>
    }

  // ── Module Onboarding ─────────────────────────────────────────────────────
  | {
      type: 'ONBOARDING_COMPLETED'
      payload: {
        level: string
        language: string
      }
    }

  // ── Module Profile ────────────────────────────────────────────────────────
  | {
      type: 'PROFILE_UPDATED'
      payload: {
        userId: string
        level: string
        goals: {
          targetHoldSeconds: number
          sessionsPerWeek: number
        }
      }
    }

  // ── Module Notifications ──────────────────────────────────────────────────
  | {
      type: 'NOTIF_PERMISSION_CHANGED'
      payload: {
        permission: NotificationPermission
      }
    }

  // ── Core Sync ─────────────────────────────────────────────────────────────
  | {
      type: 'SYNC_COMPLETED'
      payload: {
        table: string
        pushed: number
        pulled: number
      }
    }
  | {
      type: 'SYNC_FAILED'
      payload: {
        table: string
        error: string
      }
    }

/** Helper : extrait le payload d'un AppEvent par son type */
export type EventPayload<T extends AppEvent['type']> = Extract<
  AppEvent,
  { type: T }
>['payload']
