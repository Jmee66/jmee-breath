import { create } from 'zustand'
import type { PhaseType } from '@core/types'
import type { InternalPhaseType } from '../clock/types'

interface BreathState {
  phase: PhaseType | null
  /** Type interne — distingue hold-full / hold-empty / preparation */
  internalPhase: InternalPhaseType | null
  /** 0–1 */
  phaseProgress: number
  /** Secondes restantes dans la phase courante (Math.ceil) */
  remainingSeconds: number
  repIndex: number
  isRunning: boolean
  isPaused: boolean
  sessionId: string | null
  totalReps: number
  currentPhaseDuration: number
  /** Instruction personnalisée de la phase courante (phase.label) */
  phaseLabel: string | null

  /** Met à jour phase + internalPhase + duration en un seul set() atomique */
  setPhaseComplete: (phase: PhaseType, internalPhase: InternalPhaseType, duration: number, label?: string) => void
  setPhase: (phase: PhaseType, duration: number) => void
  setPhaseInternal: (phase: InternalPhaseType) => void
  setProgress: (progress: number) => void
  setRemaining: (seconds: number) => void
  setRepIndex: (index: number) => void
  startSession: (sessionId: string, totalReps: number) => void
  pauseSession: () => void
  resumeSession: () => void
  endSession: () => void
}

export const useBreathStore = create<BreathState>((set) => ({
  phase: null,
  internalPhase: null,
  phaseProgress: 0,
  remainingSeconds: 0,
  repIndex: 0,
  isRunning: false,
  isPaused: false,
  sessionId: null,
  totalReps: 0,
  currentPhaseDuration: 0,
  phaseLabel: null,

  setPhaseComplete: (phase, internalPhase, currentPhaseDuration, label) =>
    set({ phase, internalPhase, currentPhaseDuration, phaseLabel: label ?? null, phaseProgress: 0 }),
  setPhase: (phase, currentPhaseDuration) => set({ phase, currentPhaseDuration, phaseProgress: 0 }),
  setPhaseInternal: (internalPhase) => set({ internalPhase }),
  setProgress: (phaseProgress) => set({ phaseProgress }),
  setRemaining: (remainingSeconds) => set({ remainingSeconds }),
  setRepIndex: (repIndex) => set({ repIndex }),
  startSession: (sessionId, totalReps) =>
    set({ sessionId, totalReps, isRunning: true, isPaused: false, repIndex: 0 }),
  pauseSession: () => set({ isPaused: true }),
  resumeSession: () => set({ isPaused: false }),
  endSession: () =>
    set({
      phase: null,
      internalPhase: null,
      isRunning: false,
      isPaused: false,
      sessionId: null,
      phaseProgress: 0,
      remainingSeconds: 0,
      phaseLabel: null,
    }),
}))
