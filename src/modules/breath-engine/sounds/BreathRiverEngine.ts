/**
 * BreathRiverEngine — fond sonore rivière synthétisé.
 *
 * Classe pure TypeScript — aucun import React.
 * Utilise le même AudioContext que BreathClock.
 *
 * Génère un bruit brun (intégration de bruit blanc) filtré pour
 * évoquer le murmure d'une rivière calme. Deux couches :
 *
 *  · Bruit brun stéréo (L/R légèrement désynchronisés)
 *  · Filtre passe-bas à 1 kHz  — supprime le sifflement
 *  · Filtre passe-bande à 350 Hz — texture eau courante
 *  · LFO très lent (0.07 Hz) — clapotis léger et lent
 *  · Fondu d'entrée sur 3 s pour une arrivée douce
 *
 * Cross-platform : Web Audio Level 1 uniquement.
 */

import type { RiverSettings } from './riverTypes'

export class BreathRiverEngine {
  private readonly masterGain: GainNode
  private sourceL: AudioBufferSourceNode | null = null
  private sourceR: AudioBufferSourceNode | null = null
  private lfoNode: OscillatorNode | null = null

  constructor(
    private readonly audioCtx: AudioContext,
    private readonly settings: RiverSettings,
  ) {
    this.masterGain = audioCtx.createGain()
    this.masterGain.gain.value = settings.enabled ? settings.volume : 0
    this.masterGain.connect(audioCtx.destination)
  }

  start(): void {
    if (this.sourceL) return

    const sr         = this.audioCtx.sampleRate
    const duration   = 8   // secondes — boucle longue = coutures imperceptibles
    const bufferSize = Math.floor(sr * duration)

    // ── Génération du bruit brun (stéréo) ────────────────────────────────
    const buffer = this.audioCtx.createBuffer(2, bufferSize, sr)

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      let last = 0
      // Léger décalage de phase entre L et R → sensation d'espace
      const offset = ch === 1 ? Math.floor(sr * 0.07) : 0
      for (let i = 0; i < bufferSize; i++) {
        const idx   = (i + offset) % bufferSize
        const white = Math.random() * 2 - 1
        last        = (last + 0.02 * white) / 1.02
        data[idx]   = last * 3.5
      }
    }

    // ── Chaîne de traitement : source → lpf → bpf → lfoGain → fadeGain → master ──

    // Passe-bas — retire le sifflement (> 1 kHz)
    const lpf = this.audioCtx.createBiquadFilter()
    lpf.type            = 'lowpass'
    lpf.frequency.value = 1000
    lpf.Q.value         = 0.4

    // Passe-bande — texture clapotis autour de 350 Hz
    const bpf = this.audioCtx.createBiquadFilter()
    bpf.type            = 'bandpass'
    bpf.frequency.value = 350
    bpf.Q.value         = 0.7

    // LFO très lent — ondulation douce du volume (~14 s/cycle)
    const lfoGain  = this.audioCtx.createGain()
    lfoGain.gain.value = 0.88

    this.lfoNode = this.audioCtx.createOscillator()
    this.lfoNode.type            = 'sine'
    this.lfoNode.frequency.value = 0.07

    const lfoDepth = this.audioCtx.createGain()
    lfoDepth.gain.value = 0.12   // ±12 % de variation — subtil

    // Fondu d'entrée sur 3 s — arrivée douce de la rivière
    const fadeGain = this.audioCtx.createGain()
    const now      = this.audioCtx.currentTime
    fadeGain.gain.setValueAtTime(0, now)
    fadeGain.gain.linearRampToValueAtTime(1, now + 3)

    // Connexions
    this.lfoNode.connect(lfoDepth)
    lfoDepth.connect(lfoGain.gain)

    this.sourceL = this.audioCtx.createBufferSource()
    this.sourceL.buffer = buffer
    this.sourceL.loop   = true

    // Deuxième source décalée de 4 s pour casser la répétition perceptible
    this.sourceR = this.audioCtx.createBufferSource()
    this.sourceR.buffer = buffer
    this.sourceR.loop   = true

    this.sourceL.connect(lpf)
    this.sourceR.connect(lpf)
    lpf.connect(bpf)
    bpf.connect(lfoGain)
    lfoGain.connect(fadeGain)
    fadeGain.connect(this.masterGain)

    this.lfoNode.start(now)
    this.sourceL.start(now)
    this.sourceR.start(now + duration / 2)   // décalé de 4 s
  }

  stop(): void {
    try { this.sourceL?.stop() } catch { /* déjà stoppé */ }
    try { this.sourceR?.stop() } catch { /* déjà stoppé */ }
    try { this.lfoNode?.stop() } catch { /* déjà stoppé */ }
    this.sourceL = null
    this.sourceR = null
    this.lfoNode = null
  }

  /** Met à jour le volume maître à la volée (lissage 80 ms). */
  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.08)
  }
}
