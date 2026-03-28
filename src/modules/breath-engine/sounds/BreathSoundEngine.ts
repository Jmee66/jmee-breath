/**
 * BreathSoundEngine — sons des phases respiratoires.
 *
 * Architecture :
 *  · Bol tibétain (une seule frappe au début du 1er inhale)
 *  · Pad polyphonique continu pour chaque phase active
 *
 * Design sonore — tonalité Do pentatonique (+20 % vs version précédente) :
 *  · inhale      : Do3+Sol3+Do4     — quinte ouverte + octave → aérien, s'ouvre
 *  · hold-full   : Do3+Mi3+Sol3+Do4 — accord majeur complet  → plein, ancré
 *  · exhale      : Do3+Fa3+La#3    — quarte + septième       → relâchement
 *  · hold-empty  : Do3+Sol3+Ré4    — quinte + seconde haute  → vide, spacieux
 *  · recovery    : Do3+Fa3+Do4     — quarte suspendue        → apaisement
 *
 * Cross-platform (Chrome iOS / macOS / Windows) :
 *  · Web Audio API Level 1 uniquement
 *  · globalLpf permanent — pas de création/destruction de nœuds par phase
 *  · pendingOscillators — annulation propre via cancelAll()
 *  · iOS Chrome : AudioContext créé et géré par BreathClock (pas ici)
 */

import type { ScheduledPhase, InternalPhaseType } from '../clock/types'
import type { SoundSettings } from './soundTypes'

// ── Accords par phase (Hz) ────────────────────────────────────────────────────
// Toutes les fréquences ≥ 132 Hz pour garantir l'audibilité sur haut-parleurs
// de téléphone et de laptop (coupure typique ~80-120 Hz).
const PHASE_CHORDS: Partial<Record<InternalPhaseType, number[]>> = {
  inhale:       [132.0, 198.0, 264.0],              // C3, G3, C4  — ouvert, monte
  'hold-full':  [132.0, 166.3, 198.0, 264.0],       // C3, E3, G3, C4 — accord majeur plein
  exhale:       [132.0, 176.2, 235.2],              // C3, F3, Bb3 — descend, se relâche
  'hold-empty': [132.0, 198.0, 296.4],              // C3, G3, D4  — quinte ouverte, aérien
  recovery:     [132.0, 176.2, 264.0],              // C3, F3, C4  — apaisement
}

// Gain de crête par phase (normalisé — masterGain gère le volume global)
const PHASE_PEAK: Partial<Record<InternalPhaseType, number>> = {
  inhale:       0.124,
  'hold-full':  0.117,
  exhale:       0.111,
  'hold-empty': 0.082,  // plus doux que les autres mais clairement audible
  recovery:     0.085,
}

// Gain relatif de chaque voix dans le pad (1ère = fondamentale, les suivantes s'atténuent)
const VOICE_GAIN_RATIOS = [1.0, 0.72, 0.52, 0.38] as const

// Dispersion de pitch par voix (cents) → légère richesse, effet chorus naturel
const DETUNE_CENTS = [-4, 0, +4, +2] as const

// Filtre passe-bas global (un seul nœud, permanent, partagé entre toutes les phases)
const LPF_FREQ = 1056  // Hz — chaleur, arrondit les harmoniques (+20 % vs 880 Hz)
const LPF_Q    = 0.5

// ── Bol tibétain ──────────────────────────────────────────────────────────────
// Fréquence fondamentale : C4 (264 Hz) — méditative, ni trop grave ni trop aiguë
// Série harmonique inharmonique reproduisant l'acoustique du métal battu
const BOWL_FREQ = 264
const BOWL_HARMONICS = [
  { ratio: 1.000, gain: 0.28, decay: 5.0 },   // fondamentale
  { ratio: 2.756, gain: 0.11, decay: 3.8 },   // 1er partiel inharmonique
  { ratio: 5.404, gain: 0.05, decay: 2.5 },   // 2e partiel
  { ratio: 8.933, gain: 0.02, decay: 1.6 },   // 3e partiel (très faible)
]

// ── Modulation respiratoire (ventilation / récupération) ─────────────────────
// Pendant les phases recovery (≥ 10 s) : cycle 7 s montée + 14 s descente.
// Appliquée via un GainNode dédié inséré entre globalLpf et masterGain.
// Amplitude très discrète (0.88 → 1.0) pour suggérer sans imposer.
const BREATH_MOD_MIN    = 0.88
const BREATH_MOD_MAX    = 1.0
const BREATH_MOD_INHALE = 7    // secondes — montée
const BREATH_MOD_EXHALE = 14   // secondes — descente
const BREATH_MOD_MIN_DUR = 10  // phase trop courte → pas de modulation

// ─────────────────────────────────────────────────────────────────────────────

export class BreathSoundEngine {
  private readonly masterGain: GainNode
  private readonly globalLpf: BiquadFilterNode   // nœud permanent — pas de fuite mémoire
  private readonly breathModGain: GainNode        // modulation respiratoire recovery
  private pendingOscillators: OscillatorNode[] = []
  private bowlScheduled = false
  private readonly bowlOnPhase: boolean

  constructor(
    private readonly audioCtx: AudioContext,
    settings: SoundSettings,
  ) {
    this.bowlOnPhase = settings.bowlOnPhase ?? false

    // Chaîne : oscillateurs → globalLpf → breathModGain → masterGain → destination
    this.masterGain = audioCtx.createGain()
    this.masterGain.gain.value = settings.enabled ? settings.volume : 0

    this.globalLpf = audioCtx.createBiquadFilter()
    this.globalLpf.type            = 'lowpass'
    this.globalLpf.frequency.value = LPF_FREQ
    this.globalLpf.Q.value         = LPF_Q

    this.breathModGain = audioCtx.createGain()
    this.breathModGain.gain.value = 1.0   // neutre hors recovery

    this.globalLpf.connect(this.breathModGain)
    this.breathModGain.connect(this.masterGain)
    this.masterGain.connect(audioCtx.destination)
  }

  /** Met à jour le volume maître à la volée (lissage 50 ms — évite les clics). */
  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.05)
  }

  schedulePhases(phases: ScheduledPhase[]): void {
    this.bowlScheduled = false

    for (const phase of phases) {
      // Bol d'ouverture : frappe pleine au 1er inhale de l'exercice
      if (!this.bowlScheduled && phase.internalType === 'inhale' && phase.repIndex === 0) {
        this.scheduleBowl(phase.startTime)
        this.bowlScheduled = true
      }

      // Bong léger à chaque changement de phase (si option activée)
      // → on saute la phase 0 inhale (déjà couverte par le bol d'ouverture)
      if (
        this.bowlOnPhase &&
        phase.repIndex >= 0 &&
        !(phase.internalType === 'inhale' && phase.repIndex === 0)
      ) {
        this.scheduleBowlLite(phase.startTime)
      }

      // Pad continu pour toutes les phases actives (repIndex >= 0)
      if (phase.repIndex >= 0) {
        this.schedulePhasePad(phase)
      }

      // Modulation respiratoire sur les phases recovery suffisamment longues
      if (phase.internalType === 'recovery' && phase.repIndex >= 0
          && phase.durationSeconds >= BREATH_MOD_MIN_DUR) {
        this.scheduleBreathModulation(phase)
      }
    }
  }

  cancelAll(): void {
    const now = this.audioCtx.currentTime
    for (const osc of this.pendingOscillators) {
      try { osc.stop(now) } catch { /* déjà stoppé */ }
    }
    this.pendingOscillators = []
    this.bowlScheduled = false
    // Annule toutes les automations de breathModGain et revient à neutre
    this.breathModGain.gain.cancelScheduledValues(now)
    this.breathModGain.gain.setTargetAtTime(1.0, now, 0.05)
  }

  // ── Bol tibétain ─────────────────────────────────────────────────────────

  private scheduleBowl(t: number): void {
    if (t < this.audioCtx.currentTime) return

    const attackTime = 0.03  // frappe brève du maillet

    BOWL_HARMONICS.forEach((h, i) => {
      const freq = BOWL_FREQ * h.ratio
      const stop = t + attackTime + h.decay + 0.1

      const osc  = this.audioCtx.createOscillator()
      const gain = this.audioCtx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t)

      // Vibrato sur la fondamentale — shimmer naturel du métal
      if (i === 0) {
        const lfo     = this.audioCtx.createOscillator()
        const lfoGain = this.audioCtx.createGain()
        lfo.type = 'sine'
        lfo.frequency.value = 4.2           // 4.2 Hz — naturel, pas trop rapide
        lfoGain.gain.setValueAtTime(0, t)
        lfoGain.gain.linearRampToValueAtTime(freq * 0.003, t + 0.9)
        lfoGain.gain.linearRampToValueAtTime(0, t + attackTime + h.decay)
        lfo.connect(lfoGain)
        lfoGain.connect(osc.frequency)
        lfo.start(t)
        lfo.stop(stop)
        this.track(lfo)
      }

      // Enveloppe : attaque douce → décroissance exponentielle lente
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(h.gain, t + attackTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + attackTime + h.decay)

      osc.connect(gain)
      gain.connect(this.globalLpf)
      osc.start(t)
      osc.stop(stop)
      this.track(osc)
    })
  }

  /**
   * Bong léger pour marquer chaque changement de phase.
   * Mêmes partiels que le bol complet mais :
   *  · Gain réduit à 55 % — discret, ne masque pas le pad
   *  · Décroissance ×0.5 — court (~2 s) pour ne pas chevaucher la phase
   *  · Pas de vibrato — évite l'effet "double bol"
   */
  private scheduleBowlLite(t: number): void {
    if (t < this.audioCtx.currentTime) return

    const attackTime = 0.02
    const gainScale  = 0.55
    const decayScale = 0.50

    BOWL_HARMONICS.forEach((h) => {
      const freq  = BOWL_FREQ * h.ratio
      const decay = h.decay * decayScale
      const stop  = t + attackTime + decay + 0.1

      const osc  = this.audioCtx.createOscillator()
      const gain = this.audioCtx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t)

      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(h.gain * gainScale, t + attackTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + attackTime + decay)

      osc.connect(gain)
      gain.connect(this.globalLpf)
      osc.start(t)
      osc.stop(stop)
      this.track(osc)
    })
  }

  // ── Pad polyphonique continu ──────────────────────────────────────────────

  private schedulePhasePad(phase: ScheduledPhase): void {
    const freqs    = PHASE_CHORDS[phase.internalType]
    const peakGain = PHASE_PEAK[phase.internalType]
    if (!freqs || !peakGain) return

    const t        = phase.startTime
    const duration = phase.durationSeconds
    if (t < this.audioCtx.currentTime || duration < 0.5) return

    // Fondu in/out : 15% de la durée, borné entre 0.2 s et 1.5 s
    const fadeIn  = Math.min(1.5, Math.max(0.2, duration * 0.15))
    const fadeOut = Math.min(1.5, Math.max(0.2, duration * 0.15))
    const sustainEnd = t + duration - fadeOut
    const stop       = t + duration + 0.08   // léger buffer post-phase

    freqs.forEach((baseFreq, idx) => {
      // Légère dispersion de pitch → richesse sonore sans être perceptible
      const cents  = DETUNE_CENTS[idx % DETUNE_CENTS.length]
      const freq   = baseFreq * Math.pow(2, cents / 1200)

      // Atténuation progressive des voix supérieures → équilibre spectral naturel
      const voiceGain = peakGain * (VOICE_GAIN_RATIOS[idx] ?? 0.35)

      const osc  = this.audioCtx.createOscillator()
      const gain = this.audioCtx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t)

      // Enveloppe : fade in → sustain → fade out
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(voiceGain, t + fadeIn)
      gain.gain.setValueAtTime(voiceGain, sustainEnd)
      gain.gain.linearRampToValueAtTime(0.0001, t + duration)  // fin exacte de la phase

      osc.connect(gain)
      gain.connect(this.globalLpf)
      osc.start(t)
      osc.stop(stop)
      this.track(osc)
    })
  }

  // ── Modulation respiratoire recovery ─────────────────────────────────────

  /**
   * Applique un cycle 7 s montée / 14 s descente sur breathModGain pendant
   * toute la durée de la phase recovery. Subtil (0.88 ↔ 1.0).
   * Les ramps sont pré-schedulées via l'automation Web Audio → sample-accurate,
   * aucun rAF ni setInterval.
   */
  private scheduleBreathModulation(phase: ScheduledPhase): void {
    const g   = this.breathModGain.gain
    const t   = phase.startTime
    const end = t + phase.durationSeconds

    // Partir de MOD_MIN (début du cycle "inspir")
    g.setValueAtTime(BREATH_MOD_MIN, t)

    let cursor = t
    while (cursor < end - 0.5) {
      // Montée sur 7 s (inspiration)
      const riseEnd = Math.min(cursor + BREATH_MOD_INHALE, end)
      g.linearRampToValueAtTime(BREATH_MOD_MAX, riseEnd)
      cursor = riseEnd
      if (cursor >= end - 0.5) break

      // Descente sur 14 s (expiration)
      const fallEnd = Math.min(cursor + BREATH_MOD_EXHALE, end)
      g.linearRampToValueAtTime(BREATH_MOD_MIN, fallEnd)
      cursor = fallEnd
    }

    // Retour immédiat à 1.0 après la phase — n'affecte pas la phase suivante
    g.setValueAtTime(1.0, end + 0.05)
  }

  // ── Utilitaire ────────────────────────────────────────────────────────────

  private track(osc: OscillatorNode): void {
    this.pendingOscillators.push(osc)
    osc.onended = () => {
      this.pendingOscillators = this.pendingOscillators.filter((n) => n !== osc)
    }
  }
}
