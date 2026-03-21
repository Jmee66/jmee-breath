/**
 * BreathDroneEngine — fond sonore continu par phase.
 *
 * Classe pure TypeScript — aucun import React.
 * Utilise le même AudioContext que BreathClock.
 *
 * Un pad grave et doux joue pendant toute la durée de chaque phase.
 * 3 oscillateurs sine légèrement désaccordés (±5 cents) créent un
 * battement lent (~1–2 Hz) caractéristique des pads méditatifs.
 * Un filtre passe-bas adoucit la texture.
 *
 * L'enveloppe d'amplitude + un léger glissement de hauteur marquent
 * naturellement le début et la fin de chaque phase :
 *   · Début : pitch flotte légèrement en dessous, monte sur la note cible
 *   · Corps  : sustain à volume constant
 *   · Fin    : pitch redescend doucement, amplitude s'estompe
 *
 * Cross-platform :
 *   - Uniquement Web Audio Level 1 (createOscillator, createBiquadFilter,
 *     createGain, setValueAtTime, linearRampToValueAtTime, setTargetAtTime)
 *   - Compatible iOS Safari 9+, Chrome Android, Firefox, Edge
 *   - Aucun setTimeout — tout planifié sur l'axe de temps AudioContext
 */

import type { ScheduledPhase, InternalPhaseType } from '../clock/types'
import type { DroneSettings } from './droneTypes'

// ── Fréquences (×0.8 vs version précédente — registre très grave, méditatif profond) ──
const DRONE_FREQUENCY: Record<InternalPhaseType, number | null> = {
  preparation:  null,
  inhale:       207,  // ≈ A♭3 — ouverture
  'hold-full':  261,  // C4   — plénitude
  exhale:       156,  // ≈ E♭3 — relâchement
  'hold-empty': 104,  // ≈ A♭2 — vide profond
  recovery:     174,  // F3   — résolution
}

// Désaccord très léger : ±2 cents → battement ~0.25 Hz (shimmer imperceptible, pas de flutter)
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
      this.scheduleDronePhase(phase)
    }
  }

  cancelAll(): void {
    const now = this.audioCtx.currentTime
    for (const osc of this.pendingOscillators) {
      try { osc.stop(now) } catch { /* déjà stoppé */ }
    }
    this.pendingOscillators = []
  }

  // ── Pad par phase ─────────────────────────────────────────────────────────

  private scheduleDronePhase(phase: ScheduledPhase): void {
    const baseFreq = DRONE_FREQUENCY[phase.internalType]
    if (baseFreq === null) return

    const t        = phase.startTime
    const duration = phase.durationSeconds
    // Ignore les phases trop courtes ou déjà passées
    if (t < this.audioCtx.currentTime || duration < 0.8) return

    // Durées d'attaque/relâchement : 30 % de la phase, max 2 s — fondu très progressif
    const attackTime  = Math.min(2.0, duration * 0.30)
    const releaseTime = Math.min(2.0, duration * 0.30)

    // Points clés sur l'axe du temps
    const attackEnd    = t + attackTime
    const releaseStart = t + Math.max(attackTime, duration - releaseTime)
    const stopAt       = t + duration + 0.1

    // Amplitude de référence (normalisée — masterGain gère le volume réel)
    const peakGain        = 0.13
    // Glissement de pitch très subtil : −0.3 % seulement (≈ −5 cents), quasiment immobile
    const pitchDriftRatio = 0.997

    DETUNE_CENTS.forEach((cents) => {
      // Fréquence désaccordée : 2^(cents/1200) × baseFreq
      const detuneFactor = Math.pow(2, cents / 1200)
      const freq         = baseFreq * detuneFactor

      const osc    = this.audioCtx.createOscillator()
      const filter = this.audioCtx.createBiquadFilter()
      const gain   = this.audioCtx.createGain()

      // ── Oscillateur ───────────────────────────────────────────────────────
      osc.type = 'sine'

      // Glissement de pitch — flotte depuis légèrement en dessous de la note,
      // s'installe à la note cible, redescend doucement en fin de phase.
      // Crée une sensation de "souffle" qui marque naturellement début/fin.
      osc.frequency.setValueAtTime(freq * pitchDriftRatio, t)
      osc.frequency.linearRampToValueAtTime(freq, attackEnd)
      osc.frequency.setValueAtTime(freq, releaseStart)
      osc.frequency.linearRampToValueAtTime(freq * pitchDriftRatio, t + duration)

      // ── Filtre passe-bas — texture pad très sombre et veloutée ───────────
      // BiquadFilterNode type 'lowpass' : Level 1, support universel
      filter.type            = 'lowpass'
      filter.frequency.value = 450   // coupe tôt → son lointain, doux, non-intrusif
      filter.Q.value         = 0.6

      // ── Enveloppe amplitude ───────────────────────────────────────────────
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(peakGain, attackEnd)
      gain.gain.setValueAtTime(peakGain, releaseStart)
      // linearRampToValueAtTime ne peut pas cibler exactement 0 — on cible 0.0001
      gain.gain.linearRampToValueAtTime(0.0001, t + duration - 0.05)

      // ── Chaîne : osc → filtre → gain → masterGain ─────────────────────────
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
