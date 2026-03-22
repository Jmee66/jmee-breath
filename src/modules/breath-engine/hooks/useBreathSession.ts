import { useRef, useCallback, useEffect } from 'react'
import { useBreathStore } from '../store/breathStore'
import { BreathClock } from '../clock/BreathClock'
import { useSoundStore } from '../sounds/soundStore'
import { useDroneStore } from '../sounds/droneStore'
import { useRiverStore } from '../sounds/riverStore'
import { BreathVoiceGuide } from '../voice/BreathVoiceGuide'
import { useVoiceGuideStore } from '../voice/voiceGuideStore'
import { eventBus } from '@core/events'
import type { Exercise } from '@core/types'
import type { ScheduledPhase } from '../clock/types'

/**
 * Hook principal du breath engine.
 * Seul pont entre BreathClock (AudioContext) et le monde React (Zustand + eventBus).
 */
export function useBreathSession() {
  const clockRef      = useRef<BreathClock | null>(null)
  const voiceGuideRef = useRef<BreathVoiceGuide | null>(null)
  const exerciseRef   = useRef<Exercise | null>(null)
  const sessionIdRef  = useRef<string | null>(null)
  const wakeLockRef   = useRef<WakeLockSentinel | null>(null)

  const store = useBreathStore()

  // ── Wake Lock ────────────────────────────────────────────────────────────
  // Empêche le téléphone de verrouiller l'écran pendant une session active.
  // Le WakeLock est libéré automatiquement par l'OS lors du verrouillage écran
  // → il faut le ré-acquérir quand la page redevient visible.
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await (navigator as Navigator & { wakeLock: { request(type: string): Promise<WakeLockSentinel> } }).wakeLock.request('screen')
    } catch {
      // Permission refusée, mode batterie, ou non supporté — on continue sans
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  // Souscriptions réactives aux volumes et toggles — mise à jour des masterGain en temps réel
  const soundEnabled = useSoundStore((s) => s.soundEnabled)
  const soundVolume  = useSoundStore((s) => s.soundVolume)
  const droneEnabled = useDroneStore((s) => s.droneEnabled)
  const droneVolume  = useDroneStore((s) => s.droneVolume)
  const riverEnabled = useRiverStore((s) => s.riverEnabled)
  const riverVolume  = useRiverStore((s) => s.riverVolume)
  const voiceEnabled = useVoiceGuideStore((s) => s.voiceEnabled)
  useEffect(() => { clockRef.current?.setSoundEnabled(soundEnabled, soundVolume) }, [soundEnabled, soundVolume])
  useEffect(() => { clockRef.current?.setDroneEnabled(droneEnabled, droneVolume) }, [droneEnabled, droneVolume])
  useEffect(() => { clockRef.current?.setRiverEnabled(riverEnabled, riverVolume) }, [riverEnabled, riverVolume])
  useEffect(() => { voiceGuideRef.current?.setEnabled(voiceEnabled)               }, [voiceEnabled])

  // Reprise automatique si l'AudioContext a été suspendu par le système
  // (verrouillage écran, appel entrant, changement d'onglet sur iOS/Android).
  // + Ré-acquisition du Wake Lock (libéré automatiquement à l'écran verrouillé).
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Ré-acquiert le Wake Lock si une session est active (non en pause utilisateur)
        if (clockRef.current && !useBreathStore.getState().isPaused) {
          void requestWakeLock()
        }
        clockRef.current?.handlePageVisible()
      } else {
        // Stoppe proprement le rAF (évite le bug rafId fantôme)
        clockRef.current?.handlePageHidden()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [requestWakeLock])

  // ── Callbacks du clock ──────────────────────────────────────────────────

  const handlePhaseChange = useCallback((phase: ScheduledPhase) => {
    // Guidage vocal — annonce la phase dès le changement (toutes phases, y compris préparation)
    voiceGuideRef.current?.speak(phase.internalType)

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

    // Lit les préférences au moment du démarrage (snapshot, pas de subscription)
    const { soundEnabled, soundVolume, soundSet } = useSoundStore.getState()
    const { droneEnabled, droneVolume }            = useDroneStore.getState()
    const { riverEnabled, riverVolume }            = useRiverStore.getState()
    const { voiceEnabled, voiceVolume, voiceRate } = useVoiceGuideStore.getState()

    voiceGuideRef.current = new BreathVoiceGuide({
      enabled: voiceEnabled,
      volume:  voiceVolume,
      rate:    voiceRate,
    })

    const clock = new BreathClock(
      {
        onPhaseChange: handlePhaseChange,
        onTick: handleTick,
        onRepComplete: handleRepComplete,
        onSessionComplete: handleSessionComplete,
      },
      { enabled: soundEnabled, volume: soundVolume, soundSet },
      { enabled: droneEnabled, volume: droneVolume },
      { enabled: riverEnabled, volume: riverVolume },
    )
    clockRef.current = clock

    store.startSession(sessionId, exercise.repetitions)

    await clock.start(exercise) // attend audioCtx.resume() si nécessaire
    void requestWakeLock()      // garde l'écran allumé pendant la session

    eventBus.emit('SESSION_STARTED', {
      sessionId,
      exerciseId: exercise.id,
      startedAtAudio: clock.getAudioTime(),
      startedAt: new Date().toISOString(),
    })
  }, [handlePhaseChange, handleTick, handleRepComplete, handleSessionComplete, store, requestWakeLock])

  const pause = useCallback(() => {
    voiceGuideRef.current?.cancel()
    clockRef.current?.pause()
    releaseWakeLock() // libère le Wake Lock quand l'utilisateur met en pause
    store.pauseSession()
    const sessionId = sessionIdRef.current
    if (sessionId) {
      eventBus.emit('SESSION_PAUSED', { sessionId, pausedAt: Date.now() })
    }
  }, [store, releaseWakeLock])

  const resume = useCallback(() => {
    clockRef.current?.resume()
    void requestWakeLock() // ré-acquiert le Wake Lock à la reprise
    store.resumeSession()
    const sessionId = sessionIdRef.current
    if (sessionId) {
      eventBus.emit('SESSION_RESUMED', { sessionId, resumedAt: Date.now() })
    }
  }, [store, requestWakeLock])

  const stop = useCallback((abandoned = true) => {
    const sessionId = sessionIdRef.current
    const exercise = exerciseRef.current
    voiceGuideRef.current?.cancel()
    voiceGuideRef.current = null
    clockRef.current?.stop()
    clockRef.current = null
    releaseWakeLock() // libère le Wake Lock à la fin de la session

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
  }, [store, releaseWakeLock])

  // Cleanup au démontage du composant
  useEffect(() => {
    return () => {
      voiceGuideRef.current?.cancel()
      voiceGuideRef.current = null
      clockRef.current?.stop()
      clockRef.current = null
      releaseWakeLock()
    }
  }, [releaseWakeLock])

  return { start, pause, resume, stop }
}
