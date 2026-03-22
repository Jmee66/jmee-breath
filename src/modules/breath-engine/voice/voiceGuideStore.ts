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
  voicePitch:   number  // 0.5–1.5 (ignoré par Google TTS, affecte les voix natives)

  setVoiceEnabled: (enabled: boolean) => void
  setVoiceVolume:  (volume: number)   => void
  setVoiceRate:    (rate: number)     => void
  setVoicePitch:   (pitch: number)    => void
}

export const useVoiceGuideStore = create<VoiceGuideState>()(
  persist(
    (set) => ({
      voiceEnabled: true,
      voiceVolume:  0.85,
      voiceRate:    0.78,   // lent et posé — méditatif sans être trop lent
      voicePitch:   0.90,   // légèrement grave ; Google TTS l'ignore (pitch interne fixe)

      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setVoiceVolume:  (voiceVolume)  => set({ voiceVolume }),
      setVoiceRate:    (voiceRate)    => set({ voiceRate }),
      setVoicePitch:   (voicePitch)   => set({ voicePitch }),
    }),
    { name: 'breath-voice-guide-settings' },
  ),
)
