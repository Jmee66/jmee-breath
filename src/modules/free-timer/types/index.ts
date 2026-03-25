// ── Warmup types — partagés entre FreeTimerPage et CustomWarmupEditor ─────────

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

export interface CustomWarmupStep {
  /** UUID stable pour React keys et édition */
  id:          string
  pattern:     WarmupBreathPattern
  durationS:   number
  phaseName:   string
  instruction: string
  type:        WarmupStepType
}

export interface CustomWarmup {
  id:                  string
  name:                string
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
