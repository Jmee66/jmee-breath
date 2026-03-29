// ── Warmup types — partagés entre FreeTimerPage et CustomWarmupEditor ─────────

import type { ExerciseCategory } from '@core/types'
export type { ExerciseCategory }

export type WarmupStepType = 'breathe' | 'hold' | 'recovery' | 'inhale' | 'exhale' | 'co2' | 'go'

export type WarmupBreathPattern =
  | 'soupir'           // Soupir simple : 3+7 = 10s cycle
  | 'soupir-cyclique'  // Double inspir : 4+2+6+12 = 24s cycle
  | '6-6-12'           // Cohérence cardiaque : 24s cycle
  | 'hold-full'        // Rétention pleine
  | 'hold-empty'       // Rétention vide / FRC
  | 'inhale'           // Inspiration seule
  | 'exhale'           // Expiration seule
  | 'co2'              // Ocean Breath 4-8-16-4 = 32s cycle
  | 'countdown'        // Compte à rebours hold-full
  | 'go'               // Flash GO
  | 'custom'           // Cycle libre défini par l'utilisateur

export interface WarmupStep {
  durationS:   number
  instruction: string
  type:        WarmupStepType
  phaseName:   string
  pattern:     WarmupBreathPattern
}

export interface WarmupProtocol {
  name:  string
  steps: WarmupStep[]
}

export interface WarmupDisplay {
  protocolName:  string
  phaseName:     string
  instruction:   string
  stepRemaining: number
  stepProgress:  number
  totalProgress: number
  type:          WarmupStepType
  isGo:          boolean
}

// ── Custom warmup ──────────────────────────────────────────────────────────────

/**
 * Cycle respiratoire personnalisé (mode "libre").
 * Les valeurs à 0 signifient que la phase est absente.
 * Toutes les durées sont en secondes avec précision 0.5s.
 */
export interface CustomCycle {
  inhale:    number   // min 0.5
  hold:      number   // 0 = absent
  exhale:    number   // min 0.5
  holdEmpty: number   // 0 = absent (apnée vide)
}

export interface CustomWarmupStep {
  /** UUID stable pour React keys et édition */
  id:          string
  /** 'ratio' = pattern prédéfini · 'libre' = cycle personnalisé */
  mode:        'ratio' | 'libre'
  /** Utilisé quand mode === 'ratio' */
  pattern:     WarmupBreathPattern
  /** Utilisé quand mode === 'libre' */
  customCycle?: CustomCycle
  /** Durée totale de l'étape en secondes (précision 0.5s) */
  durationS:   number
  phaseName:   string
  instruction: string
  type:        WarmupStepType
}

export interface CustomWarmup {
  id:                  string
  name:                string
  /** Catégorie pour le filtrage par catégorie (favoris, page d'accueil) */
  category?:           ExerciseCategory
  /** Étapes respiratoires avant l'apnée */
  steps:               CustomWarmupStep[]
  /** Durée de la phase GO finale (secondes) */
  goDurationS:         number
  /** Pattern de récupération post-apnée */
  recoveryPattern:     WarmupBreathPattern
  recoveryDurationS:   number
  recoveryInstruction: string
  createdAt:           string
  updatedAt:           string
  syncedAt:            string | null
}
