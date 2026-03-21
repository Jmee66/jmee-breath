import { create } from 'zustand'

interface TimerState {
  isRunning: boolean
  elapsed: number
  laps: number[]
  start: () => void
  pause: () => void
  lap: () => void
  reset: () => void
  tick: (delta: number) => void
}

export const useTimerStore = create<TimerState>((set, get) => ({
  isRunning: false,
  elapsed: 0,
  laps: [],
  start: () => set({ isRunning: true }),
  pause: () => set({ isRunning: false }),
  lap: () => {
    const { elapsed, laps } = get()
    const lastLapTime = laps.reduce((a, b) => a + b, 0)
    set({ laps: [...laps, elapsed - lastLapTime] })
  },
  reset: () => set({ isRunning: false, elapsed: 0, laps: [] }),
  tick: (delta) => set((state) => ({ elapsed: state.elapsed + delta })),
}))
