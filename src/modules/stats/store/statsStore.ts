import { create } from 'zustand'

interface StatsState {
  totalSessions: number
  totalSeconds: number
  longestHoldSeconds: number
  currentStreak: number
  longestStreak: number
  isLoading: boolean
  setStats: (stats: Partial<StatsState>) => void
  setLoading: (loading: boolean) => void
}

export const useStatsStore = create<StatsState>((set) => ({
  totalSessions: 0,
  totalSeconds: 0,
  longestHoldSeconds: 0,
  currentStreak: 0,
  longestStreak: 0,
  isLoading: false,
  setStats: (stats) => set(stats),
  setLoading: (isLoading) => set({ isLoading }),
}))
