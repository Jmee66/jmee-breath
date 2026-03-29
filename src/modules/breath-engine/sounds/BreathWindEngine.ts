/**
 * BreathWindEngine — son de respiration synthétisé par bruit filtré.
 *
 * Principe :
 *   Bruit blanc en boucle → filtre bande passante → enveloppe gain → masterGain
 *
 * Design sonore :
 *   · Bruit blanc filtré (bandpass 400–700 Hz, Q=1.8) → texture de souffle
 *   · gain + fréquence du filtre animés par timer JS + setTargetAtTime :
 *       Inspiration : gain →1  + filtre →700 Hz (s'ouvre, se remplit)
 *       Expiration  : gain →0  + filtre →400 Hz (se referme, se vide)
 *   · Chaque cycle lit les durées en cours → réactif immédiatement
 *
 * Architecture : timer JS pour alterner inspir/expir, setTargetAtTime pour
 * les courbes audio (exponentielles, naturelles). Pas de pré-scheduling.
 * setBreathSpeed() stocke les nouvelles durées — le prochain cycle les utilise.
 *
 * Web Audio API Level 1 (Chrome iOS / macOS / Windows).
 */

import type { WindSettings } from './windTypes'

// ── Design sonore ─────────────────────────────────────────────────────────────
const FILTER_LOW  = 400    // Hz — expir fin (canal fermé, grave mat)
const FILTER_HIGH = 700    // Hz — inspir plein (canal ouvert, air qui passe)
const FILTER_Q    = 1.8    // légèrement résonant → texture présente, pas trop sifflante

// ── Cache bruit blanc — module-level ─────────────────────────────────────────
let _noiseBuffer: AudioBuffer | null = null
let _noiseSampleRate = 0

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (_noiseBuffer && _noiseSampleRate === ctx.sampleRate) return _noiseBuffer
  const length = ctx.sampleRate * 2   // 2 secondes de bruit (en boucle)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data   = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  _noiseBuffer     = buffer
  _noiseSampleRate = ctx.sampleRate
  return buffer
}

// ─────────────────────────────────────────────────────────────────────────────

export class BreathWindEngine {
  private readonly masterGain: GainNode
  private readonly bandpass:   BiquadFilterNode
  private readonly breathGain: GainNode
  private noiseSource: AudioBufferSourceNode | null = null
  private running = false
  private timer:    ReturnType<typeof setTimeout> | null = null
  private inhaleS = 4
  private exhaleS = 8

  constructor(
    private readonly audioCtx: AudioContext,
    settings: WindSettings,
  ) {
    // Chaîne : noiseSource → bandpass → breathGain → masterGain → destination
    this.masterGain            = audioCtx.createGain()
    this.masterGain.gain.value = settings.enabled ? settings.volume : 0

    this.bandpass                  = audioCtx.createBiquadFilter()
    this.bandpass.type             = 'bandpass'
    this.bandpass.frequency.value  = FILTER_LOW
    this.bandpass.Q.value          = FILTER_Q

    this.breathGain            = audioCtx.createGain()
    this.breathGain.gain.value = 0   // silencieux au départ

    this.bandpass.connect(this.breathGain)
    this.breathGain.connect(this.masterGain)
    this.masterGain.connect(audioCtx.destination)
  }

  /** Démarre la respiration avec les durées fournies. */
  start(inhaleS: number, exhaleS: number): void {
    if (this.running) return
    this.running  = true
    this.inhaleS  = inhaleS
    this.exhaleS  = exhaleS

    this.noiseSource        = this.audioCtx.createBufferSource()
    this.noiseSource.buffer = getNoiseBuffer(this.audioCtx)
    this.noiseSource.loop   = true
    this.noiseSource.connect(this.bandpass)
    this.noiseSource.start()

    this._beginInhale()
  }

  /** Arrête le souffle avec un fondu court (150 ms). */
  stop(): void {
    if (!this.running) return
    this.running = false
    this._clearTimer()

    const now = this.audioCtx.currentTime
    this.breathGain.gain.cancelScheduledValues(now)
    this.breathGain.gain.setTargetAtTime(0, now, 0.15)
    this.bandpass.frequency.cancelScheduledValues(now)

    const src = this.noiseSource
    this.noiseSource = null
    if (src) {
      try { src.stop(now + 0.6) } catch { /* déjà stoppé */ }
    }
  }

  /** Volume maître à la volée (lissage 80 ms). */
  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.08)
  }

  /**
   * Met à jour les durées. Si le moteur tourne et que les valeurs
   * ont changé, relance immédiatement un cycle inspir avec les
   * nouvelles durées (feedback instantané).
   */
  setBreathSpeed(inhaleS: number, exhaleS: number): void {
    const changed = inhaleS !== this.inhaleS || exhaleS !== this.exhaleS
    this.inhaleS = inhaleS
    this.exhaleS = exhaleS
    if (changed && this.running) {
      this._beginInhale()   // relance immédiatement avec les nouvelles durées
    }
  }

  /** true si la source audio est active. */
  get isActive(): boolean {
    return this.running && this.noiseSource !== null
  }

  // ── Interne ──────────────────────────────────────────────────────────────

  private _clearTimer(): void {
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null }
  }

  /**
   * Phase inspiration : gain →1, filtre →FILTER_HIGH.
   * Au bout de inhaleS secondes → lance l'expiration.
   */
  private _beginInhale(): void {
    if (!this.running) return
    const now = this.audioCtx.currentTime
    const tau = this.inhaleS / 3   // à 3τ → ~95 % du trajet

    this.breathGain.gain.cancelScheduledValues(now)
    this.breathGain.gain.setTargetAtTime(1.0, now, tau)
    this.bandpass.frequency.cancelScheduledValues(now)
    this.bandpass.frequency.setTargetAtTime(FILTER_HIGH, now, tau)

    this._clearTimer()
    this.timer = setTimeout(() => this._beginExhale(), this.inhaleS * 1000)
  }

  /**
   * Phase expiration : gain →~0, filtre →FILTER_LOW.
   * Au bout de exhaleS secondes → lance l'inspiration.
   */
  private _beginExhale(): void {
    if (!this.running) return
    const now = this.audioCtx.currentTime
    const tau = this.exhaleS / 3

    this.breathGain.gain.cancelScheduledValues(now)
    this.breathGain.gain.setTargetAtTime(0.001, now, tau)
    this.bandpass.frequency.cancelScheduledValues(now)
    this.bandpass.frequency.setTargetAtTime(FILTER_LOW, now, tau)

    this._clearTimer()
    this.timer = setTimeout(() => this._beginInhale(), this.exhaleS * 1000)
  }
}
