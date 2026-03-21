/**
 * Types du module son — breath engine.
 * Pas d'import React. Pur TypeScript.
 */

/** Jeux de sons disponibles */
export type SoundSet = 'sine' | 'crystal' | 'minimal' | 'bowl'

export interface SoundSettings {
  enabled: boolean
  /** Volume maître 0–1 */
  volume: number
  /** Jeu de sons (timbre) */
  soundSet: SoundSet
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.5,
  soundSet: 'sine',
}
