/**
 * BreathDroneEngine — fond sonore continu par phase.
 *
 * Classe pure TypeScript — aucun import React.
 * Utilise le même AudioContext que BreathClock.
 *
 * Deux comportements selon la phase :
 *
 *  · inhale  : sweep de fréquence montant sur toute la durée (air qui entre)
 *  · exhale  : sweep de fréquence descendant sur toute la durée (air qui sort)
 *  · autres  : pad statique avec léger glissement de pitch en début/fin
 *
 * 3 oscillateurs sine légèrement désaccordés (±2 cents) créent un shimmer
 * subtil. Un filtre passe-bas adoucit la texture.
 *
 * Cross-platform :
 *   - Uniquement Web Audio Level 1 (createOscillator, createBiquadFilter,
 *     createGain, setValueAtTime, linearRampToValueAtTime, setTargetAtTime)
 *   - Compatible iOS Safari 9+, Chrome Android, Firefox, Edge
 *   - Aucun setTimeout — tout planifié sur l'axe de temps AudioContext
 */

import type { ScheduledPhase, InternalPhaseType } from '../clock/types'
import type { DroneSettings } from './droneTypes'

// ── Fréquences des sweeps inhale/exhale ──────────────────────────────────────
// Le sweep couvre une quinte juste (ratio 3/2) — intervalle naturel et non agressif.
const SWEEP_LOW  = 87    // F2 — point bas (fond de la respiration)
const SWEEP_HIGH = 130   // C3 — point haut (poumons pleins)

// ── Fréquences pour les phases statiques ─────────────────────────────────────
const STATIC_FREQUENCY: Record<InternalPhaseType, number | null> = {
  preparation:  null,
  inhale:       null,   // géré par sweep
  'hold-full':  130,    // C3  — plénitude (= SWEEP_HIGH)
  exhale:       null,   // géré par sweep
  'hold-empty': 65,     // C2  — vide profond
  recovery:     87,     // F2  — résolution douce (= SWEEP_LOW)
}

// Désaccord très léger : ±2 cents → shimmer imperceptible
const DETUNE_CENTS = [0, +2, -2] as const

// ─────────────────────────────────────────────────────────────────────────────

export class BreathDroneEngine {
  private readonly masterGain: GainNode
  private pendingOscillators: OscillatorNode[] = []

  constructor(
    private readonly audioCtx: AudioContext,
    private readonly settings: DroneSettings,
  ) {
    this.masterGain = audioCtx.createGain()
    this.masterGain.gain.value = settings.volume
    this.masterGain.connect(audioCtx.destination)
  }

  /** Met à jour le volume maître à la volée (lissage 50 ms). */
  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.05)
  }

  schedulePhases(phases: ScheduledPhase[]): void {
    if (!this.settings.enabled) return
    for (const phase of phases) {
      if (phase.internalType === 'inhale') {
        this.scheduleSweep(phase, SWEEP_LOW, SWEEP_HIGH)
      } else if (phase.internalType === 'exhale') {
        this.scheduleSweep(phase, SWEEP_HIGH, SWEEP_LOW)
      } else {
        this.scheduleStaticPad(phase)
      }
    }
  }

  cancelAll(): void {
    const now = this.audioCtx.currentTime
    for (const osc of this.pendingOscillators) {
      try { osc.stop(now) } catch { /* déjà stoppé */ }
    }
    this.pendingOscillators = []
  }

  // ── Sweep inhale / exhale ─────────────────────────────────────────────────
  // La fréquence glisse continûment de freqStart à freqEnd sur toute la phase.
  // L'enveloppe d'amplitude fait un fondu en/out sur 15 % de la durée.

  private scheduleSweep(phase: ScheduledPhase, freqStart: number, freqEnd: number): void {
    const t        = phase.startTime
    const duration = phase.durationSeconds
    if (t < this.audioCtx.currentTime || duration < 0.8) return

    const fadeTime = Math.min(0.8, duration * 0.15)
    const peakGain = 0.13
    const stopAt   = t + duration + 0.05

    DETUNE_CENTS.forEach((cents) => {
      const detune = Math.pow(2, cents / 1200)

      const osc    = this.audioCtx.createOscillator()
      const filter = this.audioCtx.createBiquadFilter()
      const gain   = this.audioCtx.createGain()

      osc.type = 'sine'
      // Sweep linéaire sur toute la durée
      osc.frequency.setValueAtTime(freqStart * detune, t)
      osc.frequency.linearRampToValueAtTime(freqEnd * detune, t + duration)

      filter.type            = 'lowpass'
      filter.frequency.value = 500
      filter.Q.value         = 0.6

      // Fondu en → sustain → fondu out
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(peakGain, t + fadeTime)
      gain.gain.setValueAtTime(peakGain, t + duration - fadeTime)
      gain.gain.linearRampToValueAtTime(0.0001, t + duration - 0.05)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(this.masterGain)
      osc.start(t)
      osc.stop(stopAt)

      this.track(osc)
    })
  }

  // ── Pad statique (hold / recovery) ────────────────────────────────────────

  private scheduleStaticPad(phase: ScheduledPhase): void {
    const baseFreq = STATIC_FREQUENCY[phase.internalType]
    if (baseFreq === null) return

    const t        = phase.startTime
    const duration = phase.durationSeconds
    if (t < this.audioCtx.currentTime || duration < 0.8) return

    const attackTime  = Math.min(1.5, duration * 0.25)
    const releaseTime = Math.min(1.5, duration * 0.25)
    const attackEnd    = t + attackTime
    const releaseStart = t + Math.max(attackTime, duration - releaseTime)
    const stopAt       = t + duration + 0.1
    const peakGain     = 0.13

    DETUNE_CENTS.forEach((cents) => {
      const detuneFactor = Math.pow(2, cents / 1200)
      const freq         = baseFreq * detuneFactor

      const osc    = this.audioCtx.createOscillator()
      const filter = this.audioCtx.createBiquadFilter()
      const gain   = this.audioCtx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t)

      filter.type            = 'lowpass'
      filter.frequency.value = 450
      filter.Q.value         = 0.6

      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(peakGain, attackEnd)
      gain.gain.setValueAtTime(peakGain, releaseStart)
      gain.gain.linearRampToValueAtTime(0.0001, t + duration - 0.05)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(this.masterGain)
      osc.start(t)
      osc.stop(stopAt)

      this.track(osc)
    })
  }

  // ── Utilitaire ────────────────────────────────────────────────────────────

  private track(osc: OscillatorNode): void {
    this.pendingOscillators.push(osc)
    osc.onended = () => {
      this.pendingOscillators = this.pendingOscillators.filter((n) => n !== osc)
    }
  }
}
