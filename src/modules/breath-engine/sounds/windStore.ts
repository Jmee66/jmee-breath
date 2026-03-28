/**
 * windStore — préférences du souffle synthétisé.
 * Persisté dans localStorage via zustand/middleware persist.
 *
 * Les champs override* sont éphémères (non-persistés) :
 * mis à jour par TableRunner pendant les phases recovery/ventilation.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_WIND_SETTINGS } from './windTypes'

interface WindState {
  // ── Persisté ────────────────────────────────────────────────────────────────
  windEnabled:      boolean
  windVolume:       number
  windBreathInhaleS: number
  windBreathExhaleS: number

  setWindEnabled:       (v: boolean) => void
  setWindVolume:        (v: number)  => void
  setWindBreathInhaleS: (v: number)  => void
  setWindBreathExhaleS: (v: number)  => void

  // ── Éphémère (override par phase, non-persisté) ───────────────────────────
  windBreathOverrideActive:  boolean
  windBreathOverrideInhaleS: number
  windBreathOverrideExhaleS: number

  setBreathOverride:   (inhaleS: number, exhaleS: number) => void
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

      windBreathOverrideActive:  false,
      windBreathOverrideInhaleS: 4,
      windBreathOverrideExhaleS: 8,

      setBreathOverride: (inhaleS, exhaleS) => set({
        windBreathOverrideActive:  true,
        windBreathOverrideInhaleS: inhaleS,
        windBreathOverrideExhaleS: exhaleS,
      }),
      clearBreathOverride: () => set({ windBreathOverrideActive: false }),
    }),
    {
      name: 'breath-wind-settings',
      partialize: (s) => ({
        windEnabled:       s.windEnabled,
        windVolume:        s.windVolume,
        windBreathInhaleS: s.windBreathInhaleS,
        windBreathExhaleS: s.windBreathExhaleS,
      }),
    },
  ),
)
