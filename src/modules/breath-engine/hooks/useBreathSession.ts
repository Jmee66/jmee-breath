import { useRef, useCallback, useEffect } from 'react'
import { useBreathStore } from '../store/breathStore'
import { BreathClock } from '../clock/BreathClock'
import { eventBus } from '@core/events'
import type { Exercise } from '@core/types'
import type { ScheduledPhase } from '../clock/types'

/**
 * Hook principal du breath engine.
 * Seul pont entre BreathClock (AudioContext) et le monde React (Zustand + eventBus).
 */
export function useBreathSession() {
  const clockRef = useRef<BreathClock | null>(null)
  const exerciseRef = useRef<Exercise | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  const store = useBreathStore()

  // ── Callbacks du clock ──────────────────────────────────────────────────

  const handlePhaseChange = useCallback((phase: ScheduledPhase) => {
    // setPhaseComplete : un seul set() Zustand → zéro render intermédiaire, transitions sans saut
    store.setPhaseComplete(phase.publicType, phase.internalType, phase.durationSeconds)
    if (phase.repIndex >= 0) {
      store.setRepIndex(phase.repIndex)
    }

    // N'émet pas d'événement pour la phase de préparation
    if (phase.repIndex < 0) return

    const sessionId = sessionIdRef.current!
    eventBus.emit('PHASE_CHANGED', {
      sessionId,
      phase: phase.publicType,
      phaseIndex: phase.phaseIndex,
      repIndex: phase.repIndex,
      durationSeconds: phase.durationSeconds,
      scheduledAt: phase.startTime,
    })
  }, [store])

  const handleTick = useCallback((progress: number, remainingSeconds: number) => {
    store.setProgress(progress)
    store.setRemaining(remainingSeconds)
  }, [store])

  const handleRepComplete = useCallback((repIndex: number) => {
    const sessionId = sessionIdRef.current
    const exercise = exerciseRef.current
    if (!sessionId || !exercise) return
    eventBus.emit('REP_COMPLETED', {
      sessionId,
      repIndex,
      totalReps: exercise.repetitions,
    })
  }, [])

  const handleSessionComplete = useCallback(() => {
    const sessionId = sessionIdRef.current
    const exercise = exerciseRef.current
    if (!sessionId || !exercise) return

    store.endSession()
    eventBus.emit('SESSION_COMPLETED', {
      sessionId,
      exerciseId: exercise.id,
      exercise,
      durationSeconds: exercise.phases.reduce((s, p) => s + p.durationSeconds, 0) * exercise.repetitions,
      repsCompleted: exercise.repetitions,
      totalReps: exercise.repetitions,
      phasesLog: [],
      completedAt: new Date().toISOString(),
      abandoned: false,
    })
    clockRef.current?.stop()
    clockRef.current = null
  }, [store])

  // ── API publique ────────────────────────────────────────────────────────

  const start = useCallback(async (exercise: Exercise) => {
    // Nettoie une éventuelle session précédente
    clockRef.current?.stop()

    exerciseRef.current = exercise
    const sessionId = crypto.randomUUID()
    sessionIdRef.current = sessionId

    const clock = new BreathClock({
      onPhaseChange: handlePhaseChange,
      onTick: handleTick,
      onRepComplete: handleRepComplete,
      onSessionComplete: handleSessionComplete,
    })
    clockRef.current = clock

    store.startSession(sessionId, exercise.repetitions)

    await clock.start(exercise) // attend audioCtx.resume() si nécessaire

    eventBus.emit('SESSION_STARTED', {
      sessionId,
      exerciseId: exercise.id,
      startedAtAudio: clock.getAudioTime(),
      startedAt: new Date().toISOString(),
    })
  }, [handlePhaseChange, handleTick, handleRepComplete, handleSessionComplete, store])

  const pause = useCallback(() => {
    clockRef.current?.pause()
    store.pauseSession()
    const sessionId = sessionIdRef.current
    if (sessionId) {
      eventBus.emit('SESSION_PAUSED', { sessionId, pausedAt: Date.now() })
    }
  }, [store])

  const resume = useCallback(() => {
    clockRef.current?.resume()
    store.resumeSession()
    const sessionId = sessionIdRef.current
    if (sessionId) {
      eventBus.emit('SESSION_RESUMED', { sessionId, resumedAt: Date.now() })
    }
  }, [store])

  const stop = useCallback((abandoned = true) => {
    const sessionId = sessionIdRef.current
    const exercise = exerciseRef.current
    clockRef.current?.stop()
    clockRef.current = null

    if (store.isRunning && sessionId && exercise) {
      eventBus.emit('SESSION_COMPLETED', {
        sessionId,
        exerciseId: exercise.id,
        exercise,
        durationSeconds: 0,
        repsCompleted: store.repIndex,
        totalReps: exercise.repetitions,
        phasesLog: [],
        completedAt: new Date().toISOString(),
        abandoned,
      })
    }
    store.endSession()
  }, [store])

  // Cleanup au démontage du composant
  useEffect(() => {
    return () => {
      clockRef.current?.stop()
      clockRef.current = null
    }
  }, [])

  return { start, pause, resume, stop }
}
