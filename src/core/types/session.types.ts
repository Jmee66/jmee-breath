import type { Exercise, PhaseType } from './exercise.types'

export interface PhaseLogEntry {
  phase: PhaseType
  repIndex: number
  scheduledDuration: number
  /** Peut différer si l'utilisateur a mis en pause mid-phase */
  actualDuration: number
}

export interface Session {
  /** UUID — correspond au sessionId des events */
  id: string
  exerciseId: string
  /** Copie complète de l'exercice au moment de la session */
  exerciseSnapshot: Exercise
  startedAt: string
  completedAt: string
  durationSeconds: number
  repsCompleted: number
  totalReps: number
  phasesLog: PhaseLogEntry[]
  notes: string
  abandoned: boolean
  /** null = non encore synchronisé */
  syncedAt: string | null
  localOnly: boolean
}

export interface FreeTimerSession {
  id: string
  startedAt: string
  completedAt: string | null
  durationSeconds: number
  laps: number[]
  notes: string
  syncedAt: string | null
  /** 'apnea' = apnée statique avec spasmes | 'free' = chronomètre libre avec laps */
  mode?: 'apnea' | 'free'
}
