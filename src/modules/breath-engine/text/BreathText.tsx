import { useBreathStore } from '../store/breathStore'
import type { InternalPhaseType } from '../clock/types'

const PHASE_LABELS: Record<InternalPhaseType, string> = {
  preparation:  'Préparation',
  inhale:       'Inspiration',
  'hold-full':  'Rétention pleine',
  exhale:       'Expiration',
  'hold-empty': 'Rétention vide',
  recovery:     'Récupération',
}

const PHASE_COLOR: Record<InternalPhaseType, string> = {
  preparation:  '#4a5568',
  inhale:       '#1a85c2',
  'hold-full':  '#1a85c2',
  exhale:       '#7561af',
  'hold-empty': '#7561af',
  recovery:     '#34d399',
}

/**
 * Couche texte de la session :
 * - Nom de la phase (fade-in à chaque changement)
 * - Décompte en secondes
 * - Progression rep N / total
 */
export function BreathText() {
  const internalPhase = useBreathStore((s) => s.internalPhase)
  const remainingSeconds = useBreathStore((s) => s.remainingSeconds)
  const repIndex = useBreathStore((s) => s.repIndex)
  const totalReps = useBreathStore((s) => s.totalReps)
  const isRunning = useBreathStore((s) => s.isRunning)
  const phaseDuration = useBreathStore((s) => s.currentPhaseDuration)

  const phaseLabel = internalPhase ? PHASE_LABELS[internalPhase] : ''
  const phaseColor = internalPhase ? PHASE_COLOR[internalPhase] : 'var(--color-text-muted)'
  const showRep = isRunning && repIndex >= 0 && totalReps > 0 && internalPhase !== 'preparation'

  return (
    <div style={{ textAlign: 'center', userSelect: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>

      {/* Nom de la phase — transition couleur sur toute la durée de la phase */}
      <p
        style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color: phaseColor,
          transition: `color ${phaseDuration}s linear`,
          margin: 0,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {phaseLabel}
      </p>

      {/* Décompte */}
      <p
        style={{
          fontSize: '4rem',
          fontWeight: 700,
          fontFamily: 'monospace',
          color: 'var(--color-text-primary)',
          lineHeight: 1,
          margin: 0,
        }}
      >
        {isRunning && remainingSeconds > 0 ? remainingSeconds : '—'}
      </p>

      {/* Rep N / total — toujours dans le DOM pour éviter le saut de layout */}
      <p
        style={{
          fontSize: '0.8rem',
          color: 'var(--color-text-muted)',
          letterSpacing: '0.08em',
          margin: 0,
          visibility: showRep ? 'visible' : 'hidden',
        }}
      >
        {repIndex + 1} / {totalReps}
      </p>
    </div>
  )
}
