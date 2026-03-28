/**
 * windStore — préférences du souffle synthétisé.
 * Persisté dans localStorage via zustand/middleware persist.
 *
 * Champs éphémères (non-persistés) :
 *   · windBreathPhaseActive  : true quand on est dans une phase recovery/ventilation
 *   · windBreathOverrideActive/InhaleS/ExhaleS : override per-phase (durées explicites)
 *
 * Hiérarchie des durées dans useWindAmbience :
 *   overrideActive → overrideInhaleS/ExhaleS
 *   sinon          → windBreathInhaleS/ExhaleS (réglages globaux, réactifs live)
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_WIND_SETTINGS } from './windTypes'

interface WindState {
  // ── Persisté ────────────────────────────────────────────────────────────────
  windEnabled:       boolean
  windVolume:        number
  windBreathInhaleS: number
  windBreathExhaleS: number

  setWindEnabled:       (v: boolean) => void
  setWindVolume:        (v: number)  => void
  setWindBreathInhaleS: (v: number)  => void
  setWindBreathExhaleS: (v: number)  => void

  // ── Éphémère — phase active (non-persisté) ────────────────────────────────
  /** true pendant les phases recovery/ventilation → active le moteur souffle */
  windBreathPhaseActive: boolean

  /** Active le moteur sans override de durée — utilise les réglages globaux */
  setBreathPhaseActive: () => void

  // ── Éphémère — override per-phase (non-persisté) ─────────────────────────
  windBreathOverrideActive:  boolean
  windBreathOverrideInhaleS: number
  windBreathOverrideExhaleS: number

  /** Active le moteur avec des durées per-phase explicites */
  setBreathOverride:   (inhaleS: number, exhaleS: number) => void
  /** Désactive moteur + override (fin de phase ou fin de session) */
  clearBreathOverride: () => void
}

export const useWindStore = create<WindState>()(
  persist(
    (set) => ({
      windEnabled:       DEFAULT_WIND_SETTINGS.enabled,
      windVolume:        DEFAULT_WIND_SETTINGS.volume,
      windBreathInhaleS: DEFAULT_WIND_SETTINGS.breathInhaleS,
      windBreathExhaleS: DEFAULT_WIND_SETTINGS.breathExhaleS,

      setWindEnabled:       (windEnabled)       => set({ windEnabled }),
      setWindVolume:        (windVolume)         => set({ windVolume }),
      setWindBreathInhaleS: (windBreathInhaleS)  => set({ windBreathInhaleS }),
      setWindBreathExhaleS: (windBreathExhaleS)  => set({ windBreathExhaleS }),

      windBreathPhaseActive: false,
      setBreathPhaseActive: () => set({
        windBreathPhaseActive:    true,
        windBreathOverrideActive: false,
      }),

      windBreathOverrideActive:  false,
      windBreathOverrideInhaleS: 4,
      windBreathOverrideExhaleS: 8,

      setBreathOverride: (inhaleS, exhaleS) => set({
        windBreathPhaseActive:    true,
        windBreathOverrideActive:  true,
        windBreathOverrideInhaleS: inhaleS,
        windBreathOverrideExhaleS: exhaleS,
      }),
      clearBreathOverride: () => set({
        windBreathPhaseActive:    false,
        windBreathOverrideActive: false,
      }),
    }),
    {
      name: 'breath-wind-settings-v3',
      partialize: (s) => ({
        windEnabled:       s.windEnabled,
        windVolume:        s.windVolume,
        windBreathInhaleS: s.windBreathInhaleS,
        windBreathExhaleS: s.windBreathExhaleS,
      }),
    },
  ),
)
