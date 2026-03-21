import { useBreathStore } from '../store/breathStore'
import type { InternalPhaseType } from '../clock/types'

interface PhaseConfig {
  scaleFrom: number
  scaleTo: number
  hex: string
}

const PHASE_CONFIG: Record<InternalPhaseType, PhaseConfig> = {
  preparation:  { scaleFrom: 0.8, scaleTo: 0.8, hex: '#4a5568' },
  inhale:       { scaleFrom: 0.8, scaleTo: 1.0, hex: '#1a85c2' },
  'hold-full':  { scaleFrom: 1.0, scaleTo: 1.0, hex: '#1a85c2' },
  exhale:       { scaleFrom: 1.0, scaleTo: 0.8, hex: '#7561af' },
  'hold-empty': { scaleFrom: 0.8, scaleTo: 0.8, hex: '#7561af' },
  recovery:     { scaleFrom: 0.8, scaleTo: 0.8, hex: '#34d399' },
}

// 189 * 0.9 = 170 — légèrement en retrait de l'arc à scale max
const BASE_SIZE = 170 // px

/**
 * Cercle qui "respire" — scale piloté par phaseProgress à 60fps.
 * Couleur solide, CSS transition 0.6s sur background + border entre phases.
 * Pas de glow, pas de blur.
 */
export function BreathCircle() {
  const internalPhase = useBreathStore((s) => s.internalPhase)
  const phaseProgress = useBreathStore((s) => s.phaseProgress)

  const phaseDuration = useBreathStore((s) => s.currentPhaseDuration)

  const config = PHASE_CONFIG[internalPhase ?? 'preparation']
  const scale = config.scaleFrom + (config.scaleTo - config.scaleFrom) * phaseProgress
  const hex = config.hex
  const isPulse = internalPhase === 'hold-full' || internalPhase === 'hold-empty'
  const colorTransition = `background ${phaseDuration}s linear, border-color ${phaseDuration}s linear`

  // Pulse rAF : sin(progress × 2π) = 0 au début ET à la fin de chaque phase
  // → aucun saut à la transition, pas de CSS animation à stopper
  const pulse = isPulse ? Math.sin(phaseProgress * 2 * Math.PI) : 0
  const brightness = 1 + 0.1 * pulse

  return (
    <div style={{ flexShrink: 0 }}>
      <div
        style={{
          width: BASE_SIZE,
          height: BASE_SIZE,
          borderRadius: '50%',
          background: hex,
          border: `2px solid ${hex}`,
          transform: `scale(${scale.toFixed(4)})`,
          filter: `brightness(${brightness.toFixed(4)})`,
          transition: colorTransition,
          willChange: 'transform, filter',
        }}
      />
    </div>
  )
}
