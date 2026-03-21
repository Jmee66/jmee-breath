/**
 * soundStore — préférences sonores de la session de respiration.
 * Persisté dans localStorage via zustand/middleware persist.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SoundSet } from './soundTypes'
import { DEFAULT_SOUND_SETTINGS } from './soundTypes'

interface SoundState {
  soundEnabled: boolean
  soundVolume: number   // 0–1
  soundSet:    SoundSet

  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume:  (volume: number)   => void
  setSoundSet:     (soundSet: SoundSet) => void
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      soundEnabled: DEFAULT_SOUND_SETTINGS.enabled,
      soundVolume:  DEFAULT_SOUND_SETTINGS.volume,
      soundSet:     DEFAULT_SOUND_SETTINGS.soundSet,

      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setSoundVolume:  (soundVolume)  => set({ soundVolume }),
      setSoundSet:     (soundSet)     => set({ soundSet }),
    }),
    { name: 'breath-sound-settings' },
  ),
)
