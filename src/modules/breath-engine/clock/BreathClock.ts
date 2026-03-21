import type { Exercise, Phase, PhaseType } from '@core/types'
import type { BreathClockCallbacks, InternalPhaseType, ScheduledPhase } from './types'
import { BreathSoundEngine } from '../sounds/BreathSoundEngine'
import type { SoundSettings } from '../sounds/soundTypes'

const PREPARATION_DURATION = 3 // secondes de préparation avant la 1re rep

function resolveInternalType(phase: Phase, prevPublicType: PhaseType): InternalPhaseType {
  if (phase.type !== 'hold') return phase.type as InternalPhaseType
  return prevPublicType === 'inhale' ? 'hold-full' : 'hold-empty'
}

/**
 * Moteur de timing pour une session de respiration.
 * Classe pure TypeScript — aucun import React.
 * Utilise AudioContext pour un timing sample-accurate.
 *
 * Le BreathSoundEngine partage le même AudioContext pour garantir
 * que les sons soient alignés au sample près avec les phases visuelles.
 */
export class BreathClock {
  private audioCtx: AudioContext
  private scheduledPhases: ScheduledPhase[] = []
  private currentPhaseIndex = -1
  private rafId: number | null = null
  private pausedAt: number | null = null
  private readonly callbacks: BreathClockCallbacks
  private readonly soundEngine: BreathSoundEngine | null

  constructor(callbacks: BreathClockCallbacks, soundSettings?: SoundSettings) {
    this.audioCtx = new AudioContext()
    this.callbacks = callbacks
    this.soundEngine = soundSettings?.enabled
      ? new BreathSoundEngine(this.audioCtx, soundSettings)
      : null
  }

  /** Démarre la session. Doit être appelé depuis un geste utilisateur (autoplay policy). */
  async start(exercise: Exercise): Promise<void> {
    // Réveille l'AudioContext si suspendu (iOS Safari, Chrome mobile)
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume()
    }
    this.scheduledPhases = this.buildSchedule(exercise, this.audioCtx.currentTime)
    this.currentPhaseIndex = -1

    // Planifie les sons sur l'ensemble de la session
    this.soundEngine?.schedulePhases(this.scheduledPhases)

    this.tick()
  }

  pause(): void {
    if (this.audioCtx.state !== 'running') return
    this.pausedAt = this.audioCtx.currentTime
    void this.audioCtx.suspend()
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  resume(): void {
    if (this.pausedAt === null) return
    const suspendDuration = this.audioCtx.currentTime - this.pausedAt
    // Décale toutes les phases futures pour compenser la pause
    this.scheduledPhases = this.scheduledPhases.map((p) =>
      p.startTime >= this.pausedAt!
        ? { ...p, startTime: p.startTime + suspendDuration, endTime: p.endTime + suspendDuration }
        : p
    )
    this.pausedAt = null

    // Sons : annule les sons en attente (anciens temps) et replanifie aux nouveaux
    if (this.soundEngine) {
      this.soundEngine.cancelAll()
      const now = this.audioCtx.currentTime
      this.soundEngine.schedulePhases(
        this.scheduledPhases.filter((p) => p.startTime > now),
      )
    }

    void this.audioCtx.resume()
    this.tick()
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.soundEngine?.cancelAll()
    void this.audioCtx.close()
  }

  getAudioTime(): number {
    return this.audioCtx.currentTime
  }

  /** Délègue au masterGain du sound engine — mise à jour en temps réel. */
  setVolume(volume: number): void {
    this.soundEngine?.setVolume(volume)
  }

  // ── Boucle principale (rAF) ──────────────────────────────────────────────

  private tick = (): void => {
    const now = this.audioCtx.currentTime

    // Session terminée ?
    const last = this.scheduledPhases[this.scheduledPhases.length - 1]
    if (last && now >= last.endTime) {
      this.callbacks.onSessionComplete()
      return
    }

    const idx = this.findPhaseIndex(now)

    // Changement de phase
    if (idx !== this.currentPhaseIndex && idx >= 0) {
      const prev = this.currentPhaseIndex >= 0 ? this.scheduledPhases[this.currentPhaseIndex] : null
      this.currentPhaseIndex = idx
      const phase = this.scheduledPhases[idx]
      this.callbacks.onPhaseChange(phase)

      // Fin de répétition : on vient de passer dans la phase suivante après la dernière phase d'une rep
      if (
        prev !== null &&
        prev.repIndex >= 0 &&
        phase.repIndex > prev.repIndex
      ) {
        this.callbacks.onRepComplete(prev.repIndex)
      }
    }

    // Tick de progression
    if (idx >= 0) {
      const phase = this.scheduledPhases[idx]
      const elapsed = now - phase.startTime
      const progress = Math.min(elapsed / phase.durationSeconds, 1)
      const remaining = Math.max(phase.endTime - now, 0)
      this.callbacks.onTick(progress, Math.ceil(remaining))
    }

    this.rafId = requestAnimationFrame(this.tick)
  }

  private findPhaseIndex(now: number): number {
    return this.scheduledPhases.findIndex((p) => now >= p.startTime && now < p.endTime)
  }

  // ── Construction du planning ─────────────────────────────────────────────

  private buildSchedule(exercise: Exercise, baseTime: number): ScheduledPhase[] {
    const phases: ScheduledPhase[] = []
    let cursor = baseTime

    // Phase de préparation
    phases.push({
      internalType: 'preparation',
      publicType: 'inhale', // valeur nominale pour l'event bus, non utilisée
      durationSeconds: PREPARATION_DURATION,
      startTime: cursor,
      endTime: cursor + PREPARATION_DURATION,
      repIndex: -1,
      phaseIndex: -1,
    })
    cursor += PREPARATION_DURATION

    for (let repIndex = 0; repIndex < exercise.repetitions; repIndex++) {
      // Seed: on pose exhale comme phase précédente fictive
      // → le premier hold d'une rep (après inhale) sera 'hold-full' ✓
      let prevPublicType: PhaseType = 'exhale'

      exercise.phases.forEach((phase, phaseIndex) => {
        const internalType = resolveInternalType(phase, prevPublicType)
        phases.push({
          internalType,
          publicType: phase.type,
          durationSeconds: phase.durationSeconds,
          label: phase.label,
          startTime: cursor,
          endTime: cursor + phase.durationSeconds,
          repIndex,
          phaseIndex,
        })
        cursor += phase.durationSeconds
        prevPublicType = phase.type
      })

      // Repos entre les répétitions (pas après la dernière)
      if (repIndex < exercise.repetitions - 1 && exercise.restBetweenRepsSeconds > 0) {
        phases.push({
          internalType: 'recovery',
          publicType: 'recovery',
          durationSeconds: exercise.restBetweenRepsSeconds,
          startTime: cursor,
          endTime: cursor + exercise.restBetweenRepsSeconds,
          repIndex,
          phaseIndex: exercise.phases.length, // sentinel : après la dernière phase
        })
        cursor += exercise.restBetweenRepsSeconds
      }
    }

    return phases
  }
}
