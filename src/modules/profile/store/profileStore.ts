import { create } from 'zustand'
import type { UserLevel, UserGoals } from '@core/types'

interface ProfileState {
  displayName: string
  level: UserLevel
  bio: string
  goals: UserGoals
  isLoading: boolean
  setProfile: (profile: Partial<ProfileState>) => void
  setLoading: (loading: boolean) => void
}

export const useProfileStore = create<ProfileState>((set) => ({
  displayName: '',
  level: 'beginner',
  bio: '',
  goals: {
    targetHoldSeconds: 60,
    sessionsPerWeek: 3,
    notes: '',
  },
  isLoading: false,
  setProfile: (profile) => set(profile),
  setLoading: (isLoading) => set({ isLoading }),
}))
