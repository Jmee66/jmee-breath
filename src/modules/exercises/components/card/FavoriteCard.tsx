import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, ArrowUp, ArrowDown, GripVertical, Play } from 'lucide-react'
import type { Exercise } from '@core/types'
import { calcExerciseDuration } from '@core/types'
import { SessionConfigSheet } from '../SessionConfigSheet'
import { PhasePills } from './parts/PhasePills'
import { ExerciseMeta } from './parts/ExerciseMeta'

export interface FavoriteCardProps {
  exercise: Exercise
  isFirst: boolean
  isLast: boolean
  reorderMode: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

export function FavoriteCard({ exercise, isFirst, isLast, reorderMode, onMoveUp, onMoveDown }: FavoriteCardProps) {
  const navigate = useNavigate()
  const [showConfig, setShowConfig] = useState(false)
  const totalSeconds = calcExerciseDuration(exercise)

  return (
    <div className="card p-4 flex items-center gap-3">
      {/* Reorder controls */}
      {reorderMode && (
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="flex h-6 w-6 items-center justify-center rounded text-text-muted disabled:opacity-20 hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            <ArrowUp size={13} />
          </button>
          <GripVertical size={13} className="text-text-muted mx-auto" />
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="flex h-6 w-6 items-center justify-center rounded text-text-muted disabled:opacity-20 hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            <ArrowDown size={13} />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary leading-snug truncate">
            {exercise.name}
          </h3>
          {!reorderMode && (
            <Heart size={13} className="flex-shrink-0 mt-0.5 fill-status-error text-status-error" />
          )}
        </div>

        <PhasePills phases={exercise.phases} />

        <div className="flex items-center justify-between border-t border-border-subtle" style={{ paddingTop: '12px' }}>
          <ExerciseMeta repetitions={exercise.repetitions} totalSeconds={totalSeconds} />
          {!reorderMode && (
            <button
              onClick={() => setShowConfig(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-text-inverse hover:opacity-90 active:opacity-75 transition-opacity"
            >
              <Play size={11} fill="currentColor" />
              Démarrer
            </button>
          )}
        </div>
      </div>

      {showConfig && (
        <SessionConfigSheet
          exercise={exercise}
          onClose={() => setShowConfig(false)}
          onStart={(configured) => {
            setShowConfig(false)
            navigate('/session', { state: { exercise: configured } })
          }}
        />
      )}
    </div>
  )
}
