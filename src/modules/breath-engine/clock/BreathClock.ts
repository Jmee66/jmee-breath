import type { Exercise, Phase, PhaseType } from '@core/types'
import type { BreathClockCallbacks, InternalPhaseType, ScheduledPhase } from './types'
import { BreathSoundEngine } from '../sounds/BreathSoundEngine'
import { BreathDroneEngine } from '../sounds/BreathDroneEngine'
import { BreathRiverEngine } from '../sounds/BreathRiverEngine'
import type { SoundSettings } from '../sounds/soundTypes'
import type { DroneSettings } from '../sounds/droneTypes'
import type { RiverSettings } from '../sounds/riverTypes'

/** Durée minimale de la phase de préparation (voix désactivée ou fallback). */
const PREPARATION_DURATION_DEFAULT = 3

function resolveInternalType(phase: Phase, prevPublicType: PhaseType): InternalPhaseType {
  if (phase.type !== 'hold') return phase.type as InternalPhaseType
  return prevPublicType === 'inhale' ? 'hold-full' : 'hold-empty'
}

// Fallback webkit pour anciens Safari / Chrome iOS
const AudioCtx: typeof AudioContext =
  window.AudioContext ??
  (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

/**
 * Moteur de timing pour une session de respiration.
 * Classe pure TypeScript — aucun import React.
 * Utilise AudioContext pour un timing sample-accurate.
 *
 * Cross-platform :
 *  - webkitAudioContext fallback (anciens Safari / Chrome iOS)
 *  - handlePageVisible() : reprend l'AudioContext si suspendu par l'OS
 *    (verrouillage écran, appel entrant, changement d'onglet)
 *  - isUserPaused distingue pause volontaire vs suspension système
 */
export class BreathClock {
  private audioCtx: AudioContext
  private scheduledPhases: ScheduledPhase[] = []
  private currentPhaseIndex = -1
  private rafId: number | null = null
  private pausedAt: number | null = null
  /** true uniquement quand c'est l'utilisateur qui a mis en pause (bouton pause) */
  private isUserPaused = false
  private readonly callbacks: BreathClockCallbacks
  private readonly soundEngine: BreathSoundEngine | null
  private readonly droneEngine: BreathDroneEngine | null
  private readonly riverEngine: BreathRiverEngine | null

  constructor(
    callbacks: BreathClockCallbacks,
    soundSettings?: SoundSettings,
    droneSettings?: DroneSettings,
    riverSettings?: RiverSettings,
  ) {
    this.audioCtx    = new AudioCtx()
    this.callbacks   = callbacks
    this.soundEngine = soundSettings ? new BreathSoundEngine(this.audioCtx, soundSettings) : null
    this.droneEngine = droneSettings ? new BreathDroneEngine(this.audioCtx, droneSettings) : null
    this.riverEngine = riverSettings ? new BreathRiverEngine(this.audioCtx, riverSettings) : null
  }

  /**
   * Démarre la session. Doit être appelé depuis un geste utilisateur (autoplay policy).
   * @param preparationDuration Durée de la phase de préparation en secondes.
   *   Calculée par BreathVoiceGuide.estimatePreparationDuration() si la voix est active,
   *   sinon PREPARATION_DURATION_DEFAULT (3 s).
   */
  async start(exercise: Exercise, preparationDuration = PREPARATION_DURATION_DEFAULT): Promise<void> {
    // Réveille l'AudioContext si suspendu (iOS Safari, Chrome mobile)
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume()
    }
    this.scheduledPhases  = this.buildSchedule(exercise, this.audioCtx.currentTime, preparationDuration)
    this.currentPhaseIndex = -1

    this.riverEngine?.start()
    this.soundEngine?.schedulePhases(this.scheduledPhases)
    this.droneEngine?.schedulePhases(this.scheduledPhases)

    this.tick()
  }

  pause(): void {
    if (this.audioCtx.state !== 'running') return
    this.isUserPaused = true
    this.pausedAt     = this.audioCtx.currentTime
    void this.audioCtx.suspend()
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  resume(): void {
    if (this.pausedAt === null) return
    this.isUserPaused = false
    const suspendDuration = this.audioCtx.currentTime - this.pausedAt
    this.scheduledPhases  = this.scheduledPhases.map((p) =>
      p.startTime >= this.pausedAt!
        ? { ...p, startTime: p.startTime + suspendDuration, endTime: p.endTime + suspendDuration }
        : p
    )
    this.pausedAt = null

    const futurPhases = this.scheduledPhases.filter((p) => p.startTime > this.audioCtx.currentTime)
    if (this.soundEngine) {
      this.soundEngine.cancelAll()
      this.soundEngine.schedulePhases(futurPhases)
    }
    if (this.droneEngine) {
      this.droneEngine.cancelAll()
      this.droneEngine.schedulePhases(futurPhases)
    }

    void this.audioCtx.resume()
    this.tick()
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.riverEngine?.stop()
    this.soundEngine?.cancelAll()
    this.droneEngine?.cancelAll()
    void this.audioCtx.close()
  }

  getAudioTime(): number {
    return this.audioCtx.currentTime
  }

  /** Volume du moteur de bips de phase (masterGain). */
  setVolume(volume: number): void {
    this.soundEngine?.setVolume(volume)
  }

  /** Volume du fond sonore continu (masterGain du drone). */
  setDroneVolume(volume: number): void {
    this.droneEngine?.setVolume(volume)
  }

  /** Active/coupe les bips (mute via masterGain). */
  setSoundEnabled(enabled: boolean, volume: number): void {
    this.soundEngine?.setVolume(enabled ? volume : 0)
  }

  /** Active/coupe le fond sonore (mute via masterGain). */
  setDroneEnabled(enabled: boolean, volume: number): void {
    this.droneEngine?.setVolume(enabled ? volume : 0)
  }

  /** Active/coupe la rivière (mute via masterGain). */
  setRiverEnabled(enabled: boolean, volume: number): void {
    this.riverEngine?.setVolume(enabled ? volume : 0)
  }

  /**
   * À appeler quand la page passe en arrière-plan (visibilitychange → hidden).
   * Stoppe le rAF proprement et remet rafId à null pour que handlePageVisible()
   * puisse relancer la boucle sans condition.
   */
  handlePageHidden(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /**
   * À appeler quand la page redevient visible (visibilitychange → visible).
   * Reprend l'AudioContext si le système l'a suspendu (verrouillage écran,
   * appel entrant, changement d'onglet) et relance la boucle rAF.
   *
   * Bug corrigé : le navigateur stoppe rAF lors du verrouillage MAIS
   * rafId reste non-null → il faut toujours annuler l'ancien id avant tick().
   */
  handlePageVisible(): void {
    if (this.isUserPaused) return
    if (this.audioCtx.state === 'closed') return

    // Annule le rafId fantôme (navigateur stoppe rAF sans remettre rafId à null)
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    if (this.audioCtx.state !== 'running') {
      // 'suspended' sur Android/desktop, 'interrupted' sur iOS
      void this.audioCtx.resume().then(() => {
        if (this.rafId === null) this.tick()
      })
    } else {
      // AudioContext déjà running (rAF s'était arrêté seul)
      this.tick()
    }
  }

  // ── Boucle principale (rAF) ──────────────────────────────────────────────

  private tick = (): void => {
    const now = this.audioCtx.currentTime

    const last = this.scheduledPhases[this.scheduledPhases.length - 1]
    if (last && now >= last.endTime) {
      this.callbacks.onSessionComplete()
      return
    }

    const idx = this.findPhaseIndex(now)

    if (idx !== this.currentPhaseIndex && idx >= 0) {
      const prev = this.currentPhaseIndex >= 0 ? this.scheduledPhases[this.currentPhaseIndex] : null
      this.currentPhaseIndex = idx
      const phase = this.scheduledPhases[idx]
      this.callbacks.onPhaseChange(phase)

      if (
        prev !== null &&
        prev.repIndex >= 0 &&
        phase.repIndex > prev.repIndex
      ) {
        this.callbacks.onRepComplete(prev.repIndex)
      }
    }

    if (idx >= 0) {
      const phase    = this.scheduledPhases[idx]
      const elapsed  = now - phase.startTime
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

  private buildSchedule(exercise: Exercise, baseTime: number, preparationDuration: number): ScheduledPhase[] {
    const phases: ScheduledPhase[] = []
    let cursor = baseTime

    phases.push({
      internalType: 'preparation',
      publicType:   'inhale',
      durationSeconds: preparationDuration,
      startTime: cursor,
      endTime:   cursor + preparationDuration,
      repIndex:  -1,
      phaseIndex: -1,
    })
    cursor += preparationDuration

    for (let repIndex = 0; repIndex < exercise.repetitions; repIndex++) {
      let prevPublicType: PhaseType = 'exhale'

      exercise.phases.forEach((phase, phaseIndex) => {
        const internalType = resolveInternalType(phase, prevPublicType)
        phases.push({
          internalType,
          publicType: phase.type,
          durationSeconds: phase.durationSeconds,
          label:      phase.label,
          startTime:  cursor,
          endTime:    cursor + phase.durationSeconds,
          repIndex,
          phaseIndex,
        })
        cursor += phase.durationSeconds
        prevPublicType = phase.type
      })

      if (repIndex < exercise.repetitions - 1 && exercise.restBetweenRepsSeconds > 0) {
        phases.push({
          internalType: 'recovery',
          publicType:   'recovery',
          durationSeconds: exercise.restBetweenRepsSeconds,
          startTime:  cursor,
          endTime:    cursor + exercise.restBetweenRepsSeconds,
          repIndex,
          phaseIndex: exercise.phases.length,
        })
        cursor += exercise.restBetweenRepsSeconds
      }
    }

    return phases
  }
}
