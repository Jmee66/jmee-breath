/**
 * riverStore — préférences du fond sonore rivière.
 * Persisté dans localStorage via zustand/middleware persist.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_RIVER_SETTINGS } from './riverTypes'

interface RiverState {
  riverEnabled: boolean
  riverVolume:  number   // 0–1

  setRiverEnabled: (enabled: boolean) => void
  setRiverVolume:  (volume: number)   => void
}

export const useRiverStore = create<RiverState>()(
  persist(
    (set) => ({
      riverEnabled: DEFAULT_RIVER_SETTINGS.enabled,
      riverVolume:  DEFAULT_RIVER_SETTINGS.volume,

      setRiverEnabled: (riverEnabled) => set({ riverEnabled }),
      setRiverVolume:  (riverVolume)  => set({ riverVolume }),
    }),
    { name: 'breath-river-settings' },
  ),
)
