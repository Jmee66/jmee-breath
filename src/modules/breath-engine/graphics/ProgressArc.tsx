import { useRef } from 'react'
import { useBreathStore } from '../store/breathStore'
import type { InternalPhaseType } from '../clock/types'

const RADIUS = 96
const STROKE = 3
const SIZE = (RADIUS + STROKE + 4) * 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const CX = SIZE / 2
const CY = SIZE / 2

const PHASE_COLOR: Record<InternalPhaseType, string> = {
  preparation:  '#4a5568',
  inhale:       '#1a85c2',
  'hold-full':  '#1a85c2',
  exhale:       '#7561af',
  'hold-empty': '#7561af',
  recovery:     '#34d399',
}

/**
 * Arc SVG toujours dans le sens horaire, sans saut entre phases.
 *
 * Fill  : la tête avance (0→360°), la queue reste à 12h.
 *         arcLength = progress * C, rotation du cercle = -90°
 *
 * Unfill: la queue rattrape la tête dans le même sens.
 *         arcLength = (1-progress) * C
 *         rotation du cercle = -90° + progress*360°  (queue glisse clockwise)
 *
 * En fin de fill et début de unfill : arcLength=C, rotation=-90° → identique, pas de saut.
 * En fin de unfill et début de fill : arcLength=0 → rien visible, pas de saut.
 */
export function ProgressArc() {
  const internalPhase = useBreathStore((s) => s.internalPhase)
  const phaseProgress = useBreathStore((s) => s.phaseProgress)
  const phaseDuration = useBreathStore((s) => s.currentPhaseDuration)

  const prevPhase = useRef<InternalPhaseType | null>(null)
  const filling = useRef<boolean>(true)

  if (internalPhase !== prevPhase.current) {
    if (prevPhase.current !== null) filling.current = !filling.current
    prevPhase.current = internalPhase
  }

  const isFilling = filling.current
  const arcLength = isFilling
    ? phaseProgress * CIRCUMFERENCE
    : (1 - phaseProgress) * CIRCUMFERENCE
  const circleRotation = -90 + (isFilling ? 0 : phaseProgress * 360)
  const color = internalPhase ? PHASE_COLOR[internalPhase] : '#1e2d45'

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* Piste de fond */}
      <circle
        cx={CX} cy={CY} r={RADIUS}
        fill="none" stroke="#1e2d45" strokeWidth={STROKE}
      />
      {/* Arc de progression — tête et queue gérées via rotation + arcLength */}
      <circle
        cx={CX} cy={CY} r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeDasharray={`${arcLength} ${CIRCUMFERENCE}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(${circleRotation} ${CX} ${CY})`}
        style={{ transition: `stroke ${phaseDuration}s linear` }}
      />
    </svg>
  )
}
