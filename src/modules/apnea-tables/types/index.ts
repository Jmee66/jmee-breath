// ── Types du module Table Apnée ───────────────────────────────────────────────

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
  customPhases?:   CustomPhase[]
  customSeriesCount?: number

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
