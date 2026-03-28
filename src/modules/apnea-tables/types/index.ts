// ── Types du module Table Apnée ───────────────────────────────────────────────

import type { ExerciseCategory } from '@core/types'
export type { ExerciseCategory }

export type TableType = 'co2' | 'o2' | 'custom'
export type RecoveryPattern = 'soupir' | '6-6-12' | 'co2-pattern'

// ── Table standard (CO2 / O2) ──────────────────────────────────────────────────

export interface TableRow {
  holdS:     number   // durée rétention (secondes)
  recoveryS: number   // durée récupération (secondes)
}

// ── Table Custom ───────────────────────────────────────────────────────────────

export type CustomPhaseType =
  | 'prep'
  | 'inhale'
  | 'hold'
  | 'exhale'
  | 'recovery'
  | 'ventilation'
  | 'countdown'

export interface CustomPhase {
  type:         CustomPhaseType
  durationS:    number
  description:  string   // texte libre — affiché pendant la phase
  enabled:      boolean
  repeatCount?: number   // nombre de répétitions de cette phase dans une série (défaut 1)
}

export interface CustomTableRow {
  phases: CustomPhase[]
}

// ── Custom Programme (nouveau système flexible) ───────────────────────────────

export interface CustomPhaseItem {
  id:          string
  kind:        'phase'
  phaseType:   CustomPhaseType
  durationS:   number
  description: string
  /** Countdown only — afficher les chiffres pendant le décompte (défaut : true) */
  showNumbers?: boolean
  /** Recovery/Ventilation — override durée inspiration souffle (s). Absent = réglages globaux. */
  breathInhaleS?: number
  /** Recovery/Ventilation — override durée expiration souffle (s). Absent = réglages globaux. */
  breathExhaleS?: number
}

export interface CustomGroupItem {
  id:          string
  kind:        'group'
  label:       string
  items:       CustomPhaseItem[]
  repeatCount: number
}

export type CustomItem = CustomPhaseItem | CustomGroupItem

// ── Table unifiée ──────────────────────────────────────────────────────────────

export interface ApneaTable {
  id:   string
  name: string
  type: TableType

  // CO2 / O2 : séries standard hold + récup
  rows:            TableRow[]
  referenceMaxS:   number
  seriesCount:     number
  recoveryPattern: RecoveryPattern
  formeFactor:     number

  // Custom : template de phases + N séries identiques
  customPhases?:      CustomPhase[]
  customSeriesCount?: number

  // Custom Programme (nouveau système flexible) — remplace customPhases + customSeriesCount
  customProgram?: CustomItem[]

  // Description libre — affichée pendant la phase de préparation
  description?: string

  // CO2 / O2 : note affichée pendant la récupération (texte libre)
  recoveryNote?: string

  // Famille / catégorie (partage le même référentiel qu'Exercise.category)
  category?: ExerciseCategory

  createdAt:  string
  updatedAt:  string
  syncedAt:   string | null
}

// ── État du runner ─────────────────────────────────────────────────────────────

export type RunnerPhase = 'idle' | 'countdown' | 'hold' | 'recovery' | 'rest' | 'done'

export interface RunnerState {
  phase:           RunnerPhase
  rowIndex:        number
  totalRows:       number
  phaseRemainingS: number
  phaseTotalS:     number
  phaseProgress:   number   // 0–1
  totalProgress:   number   // 0–1
}
