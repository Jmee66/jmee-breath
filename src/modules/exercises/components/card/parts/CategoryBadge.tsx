const CATEGORY_LABELS: Record<string, string> = {
  'breathing':     'Respiration',
  'apnea':         'Apnée',
  'visualization': 'Visualisation',
  'preparation':   'Préparation',
  'meditation':    'Méditation',
  'panic':         'Panique',
  'warmup':        'Échauffement',
  'custom':        'Personnalisé',
}

const CATEGORY_COLORS: Record<string, string> = {
  'breathing':     'text-phase-inhale bg-phase-inhale/10',
  'apnea':         'text-phase-hold bg-phase-hold/10',
  'visualization': 'text-status-info bg-status-info/10',
  'preparation':   'text-phase-recovery bg-phase-recovery/10',
  'meditation':    'text-phase-exhale bg-phase-exhale/10',
  'panic':         'text-status-error bg-status-error/10',
  'warmup':        'text-status-warning bg-status-warning/10',
  'custom':        'text-text-secondary bg-bg-elevated',
}

interface Props {
  category: string
}

export function CategoryBadge({ category }: Props) {
  const label = CATEGORY_LABELS[category] ?? category
  const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.custom
  return (
    <span className={`inline-flex items-center text-xs font-semibold ${color.split(' ')[0]}`}>
      {label}
    </span>
  )
}
