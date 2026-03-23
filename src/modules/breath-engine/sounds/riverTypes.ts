/**
 * Types du module rivière — fond sonore continu (bruit brun filtré).
 * Pur TypeScript, aucun import React.
 */

export interface RiverSettings {
  enabled: boolean
  /** Volume maître 0–1 */
  volume: number
}

export const DEFAULT_RIVER_SETTINGS: RiverSettings = {
  enabled: false,
  volume:  0.28,   // −20 % (v0.2.3)
}
