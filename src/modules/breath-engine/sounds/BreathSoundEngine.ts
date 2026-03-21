/**
 * BreathSoundEngine — module son du breath engine.
 *
 * Classe pure TypeScript — aucun import React.
 * Utilise le même AudioContext que BreathClock pour un timing sample-accurate.
 *
 * Deux familles de sons :
 *  - Tonales (sine / crystal / minimal) : bip court à chaque changement de phase
 *  - Bowl : synthèse de bol tibétain par série harmonique inharmonique + vibrato
 *
 * Architecture gain :
 *  oscillateur → gainNode (enveloppe ADSR normalisée) → masterGain (volume) → destination
 *  setVolume() met à jour masterGain en temps réel, sans relancer la session.
 */

import type { ScheduledPhase, InternalPhaseType } from '../clock/types'
import type { SoundSet, SoundSettings } from './soundTypes'

// ── Fréquences tonales (gamme pentatonique de Do, registre médium-aigu) ──────
const TONE_FREQUENCY: Record<InternalPhaseType, number | null> = {
  preparation:  null,
  inhale:       523,   // C5
  'hold-full':  659,   // E5
  exhale:       392,   // G4
  'hold-empty': 261,   // C4
  recovery:     440,   // A4
}

// ── Fréquences bol (registre très grave — méditatif profond) ─────────────────
const BOWL_FREQUENCY: Record<InternalPhaseType, number | null> = {
  preparation:  null,
  inhale:       174,   // F3  — ouverture, ancrage
  'hold-full':  220,   // A3  — plénitude
  exhale:       130,   // C3  — relâchement profond
  'hold-empty': 110,   // A2  — vide, profondeur maximale
  recovery:     164,   // E3  — résolution douce
}

// ── Série harmonique inharmonique du bol tibétain ────────────────────────────
// Les rapports légèrement non-entiers sont caractéristiques du métal battu.
const BOWL_HARMONICS: Array<{ ratio: number; gainMult: number; decayMult: number }> = [
  { ratio: 1.000, gainMult: 1.00, decayMult: 1.00 },  // fondamentale
  { ratio: 2.756, gainMult: 0.38, decayMult: 0.75 },  // 1ᵉʳ partiel inharmonique
  { ratio: 5.404, gainMult: 0.13, decayMult: 0.55 },  // 2ᵉ partiel
  { ratio: 8.933, gainMult: 0.04, decayMult: 0.35 },  // 3ᵉ partiel (très faible)
]

// ── Profils tonals ────────────────────────────────────────────────────────────
interface ToneProfile {
  type: OscillatorType
  attackTime: number
  decayTime: number
  maxGain: number
}

const TONE_PROFILE: Record<Exclude<SoundSet, 'bowl'>, ToneProfile> = {
  sine:    { type: 'sine',     attackTime: 0.015, decayTime: 0.30, maxGain: 0.30 },
  crystal: { type: 'triangle', attackTime: 0.010, decayTime: 0.55, maxGain: 0.25 },
  minimal: { type: 'sine',     attackTime: 0.010, decayTime: 0.07, maxGain: 0.20 },
}

// ─────────────────────────────────────────────────────────────────────────────

export class BreathSoundEngine {
  private pendingOscillators: OscillatorNode[] = []
  private readonly masterGain: GainNode

  constructor(
    private readonly audioCtx: AudioContext,
    private readonly settings: SoundSettings,
  ) {
    // Nœud maître — contrôle le volume global en temps réel
    this.masterGain = audioCtx.createGain()
    this.masterGain.gain.value = settings.enabled ? settings.volume : 0
    this.masterGain.connect(audioCtx.destination)
  }

  /** Met à jour le volume maître instantanément (lissage 50 ms pour éviter les clics). */
  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.05)
  }

  schedulePhases(phases: ScheduledPhase[]): void {
    for (const phase of phases) {
      if (this.settings.soundSet === 'bowl') {
        this.scheduleBowlSound(phase)
      } else {
        this.scheduleToneSound(phase)
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

  // ── Son tonal (sine / crystal / minimal) ─────────────────────────────────

  private scheduleToneSound(phase: ScheduledPhase): void {
    const freq = TONE_FREQUENCY[phase.internalType]
    if (freq === null) return

    const t = phase.startTime
    if (t < this.audioCtx.currentTime) return

    const profile = TONE_PROFILE[this.settings.soundSet as Exclude<SoundSet, 'bowl'>]

    // Les gains individuels sont normalisés (sans volume) — le masterGain gère le volume.
    const osc  = this.audioCtx.createOscillator()
    const gain = this.audioCtx.createGain()

    osc.type = profile.type
    osc.frequency.setValueAtTime(freq, t)

    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(profile.maxGain, t + profile.attackTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + profile.attackTime + profile.decayTime)

    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(t)
    osc.stop(t + profile.attackTime + profile.decayTime + 0.02)

    this.track(osc)
  }

  // ── Bol tibétain ─────────────────────────────────────────────────────────

  private scheduleBowlSound(phase: ScheduledPhase): void {
    const freq = BOWL_FREQUENCY[phase.internalType]
    if (freq === null) return

    const t = phase.startTime
    if (t < this.audioCtx.currentTime) return

    const attackTime = 0.04    // frappe douce du maillet
    // Le bol résonne pour toute la durée de la phase — au minimum 1.5s
    const totalDecay = Math.max(phase.durationSeconds - attackTime, 1.5)

    BOWL_HARMONICS.forEach((h, i) => {
      const hFreq  = freq * h.ratio
      const hGain  = 0.20 * h.gainMult   // normalisé — masterGain gère le volume
      const hDecay = totalDecay * h.decayMult
      const stopAt = t + attackTime + hDecay + 0.05

      const osc  = this.audioCtx.createOscillator()
      const gain = this.audioCtx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(hFreq, t)

      // Vibrato sur la fondamentale — shimmer caractéristique du bol
      if (i === 0) {
        const lfo     = this.audioCtx.createOscillator()
        const lfoGain = this.audioCtx.createGain()
        lfo.type = 'sine'
        lfo.frequency.value = 4.5                // 4.5 Hz — tremblement naturel du métal
        // Le vibrato monte progressivement après le pic d'attaque
        lfoGain.gain.setValueAtTime(0, t)
        lfoGain.gain.linearRampToValueAtTime(freq * 0.004, t + 0.8)  // ±0.4% de déviation
        lfoGain.gain.linearRampToValueAtTime(0, t + attackTime + hDecay)
        lfo.connect(lfoGain)
        lfoGain.connect(osc.frequency)
        lfo.start(t)
        lfo.stop(stopAt)
        this.track(lfo)
      }

      // Enveloppe : attaque douce → décroissance exponentielle lente
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(hGain, t + attackTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + attackTime + hDecay)

      osc.connect(gain)
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
