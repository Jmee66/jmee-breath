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
  /**
   * Bong bol tibétain à chaque changement de phase.
   * false = bol uniquement au 1er inhale (comportement historique).
   * true  = bong léger à chaque début de phase.
   */
  bowlOnPhase: boolean
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.5,
  soundSet: 'sine',
  bowlOnPhase: false,
}
