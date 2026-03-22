import { create } from 'zustand'
import type { FreeTimerSession } from '@core/types'

interface FreeTimerStoreState {
  sessions:    FreeTimerSession[]
  isLoading:   boolean
  setSessions: (sessions: FreeTimerSession[]) => void
  addSession:  (session: FreeTimerSession) => void
  setLoading:  (loading: boolean) => void
}

export const useFreeTimerStore = create<FreeTimerStoreState>((set) => ({
  sessions:    [],
  isLoading:   false,
  setSessions: (sessions) => set({ sessions }),
  addSession:  (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),
  setLoading:  (isLoading) => set({ isLoading }),
}))
