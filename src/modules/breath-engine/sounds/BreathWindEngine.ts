/**
 * BreathWindEngine — son de respiration synthétisé par bruit filtré.
 *
 * Principe :
 *   Bruit blanc en boucle → filtre bande passante → enveloppe gain → masterGain
 *
 * Design sonore :
 *   · Bruit blanc filtré (bandpass 400–700 Hz, Q=1.8) → texture de souffle
 *   · gain + fréquence du filtre animés en synchronisation :
 *       Inspiration : gain 0→1  + filtre 400 Hz→700 Hz (s'ouvre, se remplit)
 *       Expiration  : gain 1→0  + filtre 700 Hz→400 Hz (se referme, se vide)
 *   · Pré-schedulé 1 heure — sample-accurate, aucun timer JS
 *
 * Web Audio API Level 1 (Chrome iOS / macOS / Windows).
 */

import type { WindSettings } from './windTypes'

// ── Design sonore ─────────────────────────────────────────────────────────────
const FILTER_LOW  = 400    // Hz — expir fin (canal fermé, grave mat)
const FILTER_HIGH = 700    // Hz — inspir plein (canal ouvert, air qui passe)
const FILTER_Q    = 1.8    // légèrement résonant → texture présente, pas trop sifflante
const LOOKAHEAD_S = 3600   // secondes — 1 heure d'automation pré-schedulée

// ── Cache bruit blanc — module-level ─────────────────────────────────────────
// Alloué une seule fois par sample-rate, réutilisé entre les instances.
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
  private readonly bandpass:   BiquadFilterNode   // filtre bande passante — texture de souffle
  private readonly breathGain: GainNode            // enveloppe amplitude inspir/expir
  private noiseSource: AudioBufferSourceNode | null = null
  private running = false

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
    this.running = true

    this.noiseSource        = this.audioCtx.createBufferSource()
    this.noiseSource.buffer = getNoiseBuffer(this.audioCtx)
    this.noiseSource.loop   = true
    this.noiseSource.connect(this.bandpass)
    this.noiseSource.start()

    this._schedule(this.audioCtx.currentTime, inhaleS, exhaleS)
  }

  /** Arrête le souffle avec un fondu court (150 ms). */
  stop(): void {
    if (!this.running) return
    this.running = false

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
    if (this.running) {
      this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.08)
    }
  }

  /**
   * Modifie les durées en cours de lecture.
   * Annule les automations existantes et re-schedule depuis maintenant.
   */
  setBreathSpeed(inhaleS: number, exhaleS: number): void {
    if (!this.running) return
    const now = this.audioCtx.currentTime
    this.breathGain.gain.cancelScheduledValues(now)
    this.breathGain.gain.setValueAtTime(0, now)
    this.bandpass.frequency.cancelScheduledValues(now)
    this.bandpass.frequency.setValueAtTime(FILTER_LOW, now)
    this._schedule(now, inhaleS, exhaleS)
  }

  /** true si la source audio est active. */
  get isActive(): boolean {
    return this.running && this.noiseSource !== null
  }

  // ── Interne ──────────────────────────────────────────────────────────────

  /**
   * Pré-schedule LOOKAHEAD_S secondes de cycles respiration depuis `from`.
   *
   * Par cycle :
   *   · Inspiration (inhaleS) : gain 0→1,   filtre FILTER_LOW→FILTER_HIGH
   *   · Expiration  (exhaleS) : gain 1→0,   filtre FILTER_HIGH→FILTER_LOW
   */
  private _schedule(from: number, inhaleS: number, exhaleS: number): void {
    const g = this.breathGain.gain
    const f = this.bandpass.frequency
    const end = from + LOOKAHEAD_S

    g.setValueAtTime(0,          from)
    f.setValueAtTime(FILTER_LOW, from)

    let cursor = from
    while (cursor < end) {
      // Inspiration — s'ouvre
      const riseEnd = cursor + inhaleS
      g.linearRampToValueAtTime(1.0,         riseEnd)
      f.linearRampToValueAtTime(FILTER_HIGH, riseEnd)
      cursor = riseEnd

      // Expiration — se referme
      const fallEnd = cursor + exhaleS
      g.linearRampToValueAtTime(0.0001,     fallEnd)
      f.linearRampToValueAtTime(FILTER_LOW, fallEnd)
      cursor = fallEnd
    }
  }
}
