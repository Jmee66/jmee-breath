/**
 * BreathRiverEngine — STUB silencieux.
 * Son d'ambiance (rivière / nature) — à redéfinir.
 */

import type { RiverSettings } from './riverTypes'

export class BreathRiverEngine {
  private readonly masterGain: GainNode

  constructor(
    private readonly audioCtx: AudioContext,
    settings: RiverSettings,
  ) {
    this.masterGain = audioCtx.createGain()
    this.masterGain.gain.value = settings.enabled ? settings.volume : 0
    this.masterGain.connect(audioCtx.destination)
  }

  start(): void {
    // silence — son à définir
  }

  stop(): void {
    // rien à stopper
  }

  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.08)
  }
}
