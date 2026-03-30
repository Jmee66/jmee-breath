import type { Phase, PhaseType } from '@core/types'

const PHASE_COLORS: Record<PhaseType, string> = {
  inhale:      'text-phase-inhale',
  hold:        'text-phase-hold',
  exhale:      'text-phase-exhale',
  recovery:    'text-phase-recovery',
  ventilation: 'text-phase-ventilation',
}

const PHASE_BG: Record<PhaseType, string> = {
  inhale:      'bg-phase-inhale/10',
  hold:        'bg-phase-hold/10',
  exhale:      'bg-phase-exhale/10',
  recovery:    'bg-phase-recovery/10',
  ventilation: 'bg-phase-ventilation/10',
}

export const PHASE_LABELS: Record<PhaseType, string> = {
  inhale:      '↑',
  hold:        '⏸',
  exhale:      '↓',
  recovery:    '○',
  ventilation: '≋',
}

interface Props {
  phases: Phase[]
}

export function PhasePills({ phases }: Props) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {phases.map((phase, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-1 rounded-md px-2 py-1 ${PHASE_BG[phase.type]}`}
        >
          <span className={`text-xs font-bold ${PHASE_COLORS[phase.type]}`}>
            {PHASE_LABELS[phase.type]}
          </span>
          <span className={`text-xs font-mono ${PHASE_COLORS[phase.type]}`}>
            {phase.durationSeconds}s
          </span>
        </div>
      ))}
    </div>
  )
}
