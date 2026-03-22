/**
 * BreathRiverEngine — fond sonore rivière depuis fichier audio.
 *
 * Charge le fichier public/sounds/river.wav via fetch + decodeAudioData,
 * le joue en boucle avec fade in/out.
 *
 * Optimisations :
 *  · Cache module-level : le buffer décodé est réutilisé entre les instances
 *    (un seul fetch + decode pour toute la durée de vie de l'app)
 *  · loadId : annule toute tentative de démarrage si stop() est appelé
 *    pendant le chargement (race condition toggle rapide)
 *  · Fade in 1.5 s / Fade out 1.5 s — transitions douces
 *
 * Web Audio API Level 1 (Chrome iOS / macOS / Windows).
 */

import type { RiverSettings } from './riverTypes'

// ── Cache module — partagé entre toutes les instances ─────────────────────────
let _riverBuffer:   AudioBuffer | null = null
let _loadPromise:   Promise<AudioBuffer> | null = null

async function getRiverBuffer(audioCtx: AudioContext, url: string): Promise<AudioBuffer> {
  if (_riverBuffer) return _riverBuffer
  if (!_loadPromise) {
    _loadPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`River audio fetch failed: ${r.status}`)
        return r.arrayBuffer()
      })
      .then((ab) => audioCtx.decodeAudioData(ab))
      .then((buf) => { _riverBuffer = buf; return buf })
      .catch((err) => {
        _loadPromise = null   // Permet une nouvelle tentative
        throw err
      })
  }
  return _loadPromise
}

// ─────────────────────────────────────────────────────────────────────────────

export class BreathRiverEngine {
  private readonly masterGain: GainNode
  private source:        AudioBufferSourceNode | null = null
  private running        = false
  private targetVolume:  number
  private loadId         = 0   // Annule les chargements obsolètes

  constructor(
    private readonly audioCtx: AudioContext,
    settings: RiverSettings,
  ) {
    this.targetVolume          = settings.volume
    this.masterGain            = audioCtx.createGain()
    this.masterGain.gain.value = 0   // fade in géré par loadAndStart()
    this.masterGain.connect(audioCtx.destination)
  }

  /**
   * Charge le buffer audio (ou le récupère du cache) puis démarre la lecture.
   * @param url URL du fichier river.wav — typiquement `${import.meta.env.BASE_URL}sounds/river.wav`
   */
  async loadAndStart(url: string): Promise<void> {
    if (this.running) return
    const id = ++this.loadId   // Identifiant de cette tentative de chargement

    let buffer: AudioBuffer
    try {
      buffer = await getRiverBuffer(this.audioCtx, url)
    } catch {
      // Fichier introuvable ou décodage impossible — silence, pas de crash
      return
    }

    // Annulé pendant le chargement (stop() appelé entre-temps)
    if (id !== this.loadId) return

    this.running        = true
    this.source         = this.audioCtx.createBufferSource()
    this.source.buffer  = buffer
    this.source.loop    = true
    this.source.connect(this.masterGain)

    // Fade in 1.5 s
    const now = this.audioCtx.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(0, now)
    this.masterGain.gain.linearRampToValueAtTime(this.targetVolume, now + 1.5)

    this.source.start()
  }

  stop(): void {
    this.loadId++   // Invalide tout chargement en cours

    if (!this.running) return
    this.running = false

    const ctx    = this.audioCtx
    const now    = ctx.currentTime
    const stopAt = now + 1.5

    // Fade out 1.5 s
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.linearRampToValueAtTime(0.0001, stopAt)

    try { this.source?.stop(stopAt + 0.05) } catch { /* déjà stoppé */ }
    this.source = null
  }

  /** Volume live (lissage 80 ms). */
  setVolume(volume: number): void {
    this.targetVolume = volume
    if (this.running) {
      this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.08)
    }
  }
}
