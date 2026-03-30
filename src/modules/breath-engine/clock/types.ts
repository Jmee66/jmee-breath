import type { PhaseType } from '@core/types'

/** Type interne — distingue les deux holds (après inhale vs après exhale) */
export type InternalPhaseType =
  | 'preparation'
  | 'inhale'
  | 'hold-full'    // rétention pleine (poumons pleins, après inhale)
  | 'hold-empty'   // rétention vide (poumons vides, après exhale)
  | 'exhale'
  | 'recovery'
  | 'ventilation'

/** Une phase pré-planifiée dans le timeline AudioContext */
export interface ScheduledPhase {
  internalType: InternalPhaseType
  /** Type public utilisé dans l'event bus — 'hold' pour les deux variants */
  publicType: PhaseType
  durationSeconds: number
  /** Texte libre défini sur la phase (phase.label) */
  label?: string
  /** AudioContext.currentTime absolu où la phase commence */
  startTime: number
  /** AudioContext.currentTime absolu où la phase se termine */
  endTime: number
  /** Index de répétition (0-based). -1 = préparation avant la 1re rep */
  repIndex: number
  /** Index dans le tableau exercise.phases. -1 = préparation ou recovery inter-rep */
  phaseIndex: number
}

export interface BreathClockCallbacks {
  onPhaseChange: (phase: ScheduledPhase) => void
  /** Appelé à chaque frame rAF. progress ∈ [0,1], remainingSeconds = Math.ceil */
  onTick: (progress: number, remainingSeconds: number) => void
  onRepComplete: (repIndex: number) => void
  onSessionComplete: () => void
}
