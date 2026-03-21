/**
 * droneStore — préférences du fond sonore continu.
 * Persisté dans localStorage via zustand/middleware persist.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_DRONE_SETTINGS } from './droneTypes'

interface DroneState {
  droneEnabled: boolean
  droneVolume:  number   // 0–1

  setDroneEnabled: (enabled: boolean) => void
  setDroneVolume:  (volume: number)   => void
}

export const useDroneStore = create<DroneState>()(
  persist(
    (set) => ({
      droneEnabled: DEFAULT_DRONE_SETTINGS.enabled,
      droneVolume:  DEFAULT_DRONE_SETTINGS.volume,

      setDroneEnabled: (droneEnabled) => set({ droneEnabled }),
      setDroneVolume:  (droneVolume)  => set({ droneVolume }),
    }),
    { name: 'breath-drone-settings' },
  ),
)
