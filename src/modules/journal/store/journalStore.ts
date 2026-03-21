import { create } from 'zustand'
import type { Session } from '@core/types'

interface JournalState {
  sessions: Session[]
  isLoading: boolean
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  setLoading: (loading: boolean) => void
}

export const useJournalStore = create<JournalState>((set) => ({
  sessions: [],
  isLoading: false,
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),
  setLoading: (isLoading) => set({ isLoading }),
}))
