/**
 * Types du module drone — fond sonore continu par phase.
 * Pur TypeScript, aucun import React.
 */

export interface DroneSettings {
  enabled: boolean
  /** Volume maître 0–1 */
  volume: number
}

export const DEFAULT_DRONE_SETTINGS: DroneSettings = {
  enabled: true,
  volume:  0.35,
}
