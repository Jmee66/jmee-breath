/**
 * BreathDroneEngine — STUB silencieux.
 * Fond sonore continu (drone/sweep) — à redéfinir.
 */

import type { ScheduledPhase } from '../clock/types'
import type { DroneSettings } from './droneTypes'

export class BreathDroneEngine {
  private readonly masterGain: GainNode

  constructor(
    private readonly audioCtx: AudioContext,
    settings: DroneSettings,
  ) {
    this.masterGain = audioCtx.createGain()
    this.masterGain.gain.value = settings.enabled ? settings.volume : 0
    this.masterGain.connect(audioCtx.destination)
  }

  setVolume(volume: number): void {
    this.masterGain.gain.setTargetAtTime(volume, this.audioCtx.currentTime, 0.05)
  }

  schedulePhases(_phases: ScheduledPhase[]): void {
    // silence — sons à définir
  }

  cancelAll(): void {
    // rien à annuler
  }
}
