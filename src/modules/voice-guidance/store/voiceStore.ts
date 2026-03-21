import { create } from 'zustand'

interface VoiceState {
  enabled: boolean
  volume: number
  rate: number
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
  setRate: (rate: number) => void
}

export const useVoiceStore = create<VoiceState>((set) => ({
  enabled: true,
  volume: 0.9,
  rate: 1.0,
  setEnabled: (enabled) => set({ enabled }),
  setVolume: (volume) => set({ volume }),
  setRate: (rate) => set({ rate }),
}))
