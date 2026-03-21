/**
 * voiceGuideStore — préférences du guidage vocal.
 * Persisté dans localStorage.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface VoiceGuideState {
  voiceEnabled: boolean
  voiceVolume:  number  // 0–1
  voiceRate:    number  // 0.5–1.0

  setVoiceEnabled: (enabled: boolean) => void
  setVoiceVolume:  (volume: number)   => void
  setVoiceRate:    (rate: number)     => void
}

export const useVoiceGuideStore = create<VoiceGuideState>()(
  persist(
    (set) => ({
      voiceEnabled: true,
      voiceVolume:  0.85,
      voiceRate:    0.75,   // rythme méditatif par défaut

      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setVoiceVolume:  (voiceVolume)  => set({ voiceVolume }),
      setVoiceRate:    (voiceRate)    => set({ voiceRate }),
    }),
    { name: 'breath-voice-guide-settings' },
  ),
)
