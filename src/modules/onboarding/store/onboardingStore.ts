import { create } from 'zustand'
import { db } from '@core/db'

interface OnboardingState {
  isCompleted: boolean
  isLoading: boolean
  currentStep: number
  load: () => Promise<void>
  complete: (level: string, language: string) => Promise<void>
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isCompleted: false,
  isLoading: true,
  currentStep: 0,
  load: async () => {
    const state = await db.onboarding.get('local')
    set({ isCompleted: state?.isCompleted ?? false, isLoading: false })
  },
  complete: async (level: string, language: string) => {
    await db.onboarding.put({
      id: 'local',
      isCompleted: true,
      completedAt: new Date().toISOString(),
      level,
    })
    set({ isCompleted: true })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void language // sera utilisé par le module settings
  },
}))
