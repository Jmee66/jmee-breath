/**
 * BreathWindEngine — son de respiration basé sur un sample audio.
 *
 * Principe :
 *   · Charge un sample MP3 de respiration (breath-sample.mp3)
 *   · Inspiration : joue le sample en marche avant
 *   · Expiration  : joue le sample en marche arrière (buffer inversé)
 *   · playbackRate ajusté pour coller à la durée cible :
 *       rate = sampleDuration / targetDuration
 *   · Timer JS alterne inspir/expir — réactif immédiatement
 *
 * Chaîne audio : source → fadeGain → masterGain → destination
 *   · fadeGain  : fondu 80 ms en début/fin de chaque phase (anti-click)
 *   · masterGain : volume maître réglable en live
 *
 * Web Audio API Level 1 (Chrome iOS / macOS / Windows).
 */

import type { WindSettings } from './windTypes'

// ── Cache module-level — partagé entre les instances ────────────────────────
let _forwardBuffer: AudioBuffer | null = null
let _reverseBuffer: AudioBuffer | null = null
let _loadPromise:   Promise<void> | null = null
let _sampleRate     = 0

function ensureBuffers(ctx: AudioContext, url: string): Promise<void> {
  if (_forwardBuffer && _sampleRate === ctx.sampleRate) return Promise.resolve()
  if (_loadPromise) return _loadPromise

  _loadPromise = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Breath sample fetch failed: ${r.status}`)
      return r.arrayBuffer()
    })
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => {
      _forwardBuffer = buf
      _sampleRate    = ctx.sampleRate

      // Crée le buffer inversé (expiration)
      _reverseBuffer = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate)
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const fwd = buf.getChannelData(ch)
        const rev = _reverseBuffer.getChannelData(ch)
        for (let i = 0; i < fwd.length; i++) {
          rev[i] = fwd[fwd.length - 1 - i]
        }
      }
    })
    .catch((err) => {
      _loadPromise = null
      throw err
    })

  return _loadPromise
}

// ─────────────────────────────────────────────────────────────────────────────

export class BreathWindEngine {
  private readonly masterGain: GainNode
  private currentSource: AudioBufferSourceNode | null = null
  private currentFade:   GainNode | null = null
  private running  = false
  private loaded   = false
  private timer:   ReturnType<typeof setTimeout> | null = null
  private inhaleS  = 4
  private exhaleS  = 8

  constructor(
    private readonly audioCtx: AudioContext,
    settings: WindSettings,
  ) {
    this.masterGain            = audioCtx.createGain()
    this.masterGain.gain.value = settings.enabled ? settings.volume : 0
    this.masterGain.connect(audioCtx.destination)
  }

  /** Charge le sample (cache module-level). */
  async load(url: string): Promise<void> {
    try {
      await ensureBuffers(this.audioCtx, url)
      this.loaded = true
    } catch {
      // Fichier introuvable — silence, pas de crash
    }
  }

  /** Démarre le cycle inspir/expir. */
  start(inhaleS: number, exhaleS: number): void {
    if (this.running || !this.loaded) return
    this.running = true
    this.inhaleS = inhaleS
    this.exhaleS = exhaleS
    this._beginInhale()
  }

  /** Arrête avec fondu court. */
  stop(): void {
    if (!this.running) return
    this.running = false
    this._clearTimer()
    this._fadeOutCurrent()
  }

  /**
   * Relance le cycle si le moteur est censé tourner mais que la source
   * a été tuée (interruption iOS, verrouillage écran).
   */
  ensurePlaying(inhaleS: number, exhaleS: number): void {
    if (!this.loaded) return
    this.inhaleS = inhaleS
    this.exhaleS = exhaleS
    // Si running mais source morte → relancer
    if (this.running && !this.currentSource) {
      this._clearTimer()
      this._beginInhale()
      return
    }
    // Si pas running → démarrer normalement
    if (!this.running) {
      this.running = true
      this._beginInhale()
    }
  }

  /** Volume maître live (lissage 80 ms). */
  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.08)
  }

  /**
   * Met à jour les durées. Si le moteur tourne et que les valeurs
   * ont changé, relance immédiatement un cycle inspir.
   */
  setBreathSpeed(inhaleS: number, exhaleS: number): void {
    const changed = inhaleS !== this.inhaleS || exhaleS !== this.exhaleS
    this.inhaleS = inhaleS
    this.exhaleS = exhaleS
    if (changed && this.running) {
      this._beginInhale()
    }
  }

  get isActive(): boolean {
    return this.running && this.loaded
  }

  // ── Interne ──────────────────────────────────────────────────────────────

  private _clearTimer(): void {
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null }
  }

  /** Fondu sortant sur la source en cours (80 ms). */
  private _fadeOutCurrent(): void {
    if (this.currentSource && this.currentFade) {
      const now = this.audioCtx.currentTime
      this.currentFade.gain.cancelScheduledValues(now)
      this.currentFade.gain.setValueAtTime(this.currentFade.gain.value, now)
      this.currentFade.gain.linearRampToValueAtTime(0, now + 0.08)
      const src = this.currentSource
      try { src.stop(now + 0.15) } catch { /* déjà stoppé */ }
    }
    this.currentSource = null
    this.currentFade   = null
  }

  /** Joue un buffer avec playbackRate ajusté + fade in/out. */
  private _play(buffer: AudioBuffer, durationS: number): void {
    this._fadeOutCurrent()

    // Sécurité iOS : ne rien faire si AudioContext n'est pas actif
    if (this.audioCtx.state !== 'running') return

    try {
      const now  = this.audioCtx.currentTime
      const rate = buffer.duration / durationS

      const source   = this.audioCtx.createBufferSource()
      source.buffer  = buffer
      source.loop    = true
      source.playbackRate.value = rate

      const fade            = this.audioCtx.createGain()
      fade.gain.value       = 0

      source.connect(fade)
      fade.connect(this.masterGain)

      // Fade in 80 ms
      fade.gain.setValueAtTime(0, now)
      fade.gain.linearRampToValueAtTime(1, now + 0.08)
      // Fade out 80 ms avant la fin
      const fadeOutStart = Math.max(now + 0.08, now + durationS - 0.08)
      fade.gain.setValueAtTime(1, fadeOutStart)
      fade.gain.linearRampToValueAtTime(0, now + durationS)

      source.start(now)
      source.stop(now + durationS + 0.05)

      // Détecte source tuée par iOS (interruption, verrouillage)
      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null
          this.currentFade   = null
        }
      }

      this.currentSource = source
      this.currentFade   = fade
    } catch {
      // AudioContext invalide ou interrompu — on laisse le watchdog relancer
      this.currentSource = null
      this.currentFade   = null
    }
  }

  /** Phase inspiration : sample en avant. */
  private _beginInhale(): void {
    if (!this.running || !_forwardBuffer) return
    this._clearTimer()
    this._play(_forwardBuffer, this.inhaleS)
    this.timer = setTimeout(() => this._beginExhale(), this.inhaleS * 1000)
  }

  /** Phase expiration : sample inversé. */
  private _beginExhale(): void {
    if (!this.running || !_reverseBuffer) return
    this._clearTimer()
    this._play(_reverseBuffer, this.exhaleS)
    this.timer = setTimeout(() => this._beginInhale(), this.exhaleS * 1000)
  }
}
