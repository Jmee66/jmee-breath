// ── Types du module Table Apnée ───────────────────────────────────────────────

export type TableType = 'co2' | 'o2' | 'mix'
export type RecoveryPattern = 'soupir' | '6-6-12' | 'co2-pattern'

export interface TableRow {
  holdS:     number   // durée rétention (secondes)
  recoveryS: number   // durée récupération (secondes)
}

export interface ApneaTable {
  id:              string
  name:            string
  type:            TableType
  rows:            TableRow[]
  /** Référence utilisée pour la génération automatique (PB ou custom) */
  referenceMaxS:   number
  /** Nombre de séries */
  seriesCount:     number
  /** Motif de respiration pendant la récupération */
  recoveryPattern: RecoveryPattern
  /** Facteur forme du jour : −0.3 → +0.2, défaut 0 */
  formeFactor:     number
  createdAt:       string
  updatedAt:       string
  syncedAt:        string | null
}

// ── État du runner ─────────────────────────────────────────────────────────────

export type RunnerPhase = 'idle' | 'countdown' | 'hold' | 'recovery' | 'rest' | 'done'

export interface RunnerState {
  phase:       RunnerPhase
  rowIndex:    number         // séries 0-based
  totalRows:   number
  phaseRemainingS: number
  phaseTotalS:     number
  phaseProgress:   number     // 0-1
  totalProgress:   number     // 0-1
}
