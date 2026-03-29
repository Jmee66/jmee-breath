/**
 * Types du module souffle — son de respiration synthétisé.
 * Pur TypeScript, aucun import React.
 */

export interface WindSettings {
  enabled:      boolean
  /** Volume maître 0–1 */
  volume:       number
  /** Durée inspiration (s) */
  breathInhaleS: number
  /** Durée expiration (s) */
  breathExhaleS: number
}

export const DEFAULT_WIND_SETTINGS: WindSettings = {
  enabled:       false,
  volume:        0.024,
  breathInhaleS: 4,
  breathExhaleS: 8,
}
