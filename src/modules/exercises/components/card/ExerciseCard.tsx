import { useState } from 'react'
import { Heart, Pencil, Trash2, ChevronRight, Info } from 'lucide-react'
import type { Exercise } from '@core/types'
import { calcExerciseDuration } from '@core/types'
import { SessionConfigSheet } from '../SessionConfigSheet'
import { CategoryBadge } from './parts/CategoryBadge'
import { DifficultyDots } from './parts/DifficultyDots'
import { PhasePills } from './parts/PhasePills'
import { ExerciseMeta } from './parts/ExerciseMeta'

interface ExerciseCardProps {
  exercise: Exercise
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  onStart: (exercise: Exercise) => void
  onEdit?: (exercise: Exercise) => void
  onDelete?: (id: string) => void
  compact?: boolean
}

export function ExerciseCard({
  exercise,
  isFavorite,
  onToggleFavorite,
  onStart,
  onEdit,
  onDelete,
  compact = false,
}: ExerciseCardProps) {
  const [showConfig, setShowConfig] = useState(false)
  const [showDesc, setShowDesc] = useState(false)
  const totalSeconds = calcExerciseDuration(exercise)

  return (
    <div className="card p-4 flex flex-col gap-3 animate-fade-in">

      {/* ── Identité : nom + info + favoris ── */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary truncate">
          {exercise.name}
        </h3>
        <div className="flex items-center flex-shrink-0" style={{ gap: '4px' }}>
          {exercise.description && !compact && (
            <button
              onClick={() => setShowDesc(v => !v)}
              aria-label={showDesc ? 'Masquer la description' : 'Afficher la description'}
              className="p-1.5 rounded-lg transition-colors"
            >
              <Info
                size={15}
                className={showDesc ? 'text-accent' : 'text-text-muted'}
              />
            </button>
          )}
          <button
            onClick={() => onToggleFavorite(exercise.id)}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className="p-1.5 rounded-lg transition-colors"
          >
            <Heart
              size={15}
              className={isFavorite ? 'fill-status-error text-status-error' : 'text-text-muted'}
            />
          </button>
        </div>
      </div>

      {/* ── Méta : catégorie + niveau ── */}
      <div className="flex items-center gap-2">
        <CategoryBadge category={exercise.category} />
        <DifficultyDots level={exercise.difficulty} />
      </div>

      {/* ── Séquence : phases ── */}
      <PhasePills phases={exercise.phases} />

      {/* ── Description (toggleable via bouton ⓘ) ── */}
      {showDesc && exercise.description && (
        <div className="flex flex-col" style={{ gap: '8px' }}>
          {exercise.description.split('\n\n').map((para, i) => (
            <p key={i} className="text-xs text-text-muted" style={{ lineHeight: '1.7' }}>
              {para.split('\n').map((line, j, arr) => (
                <span key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
        </div>
      )}

      {/* ── Footer : durée + actions ── */}
      <div className="flex items-center justify-between border-t border-border-subtle" style={{ paddingTop: '14px', gap: '12px' }}>
        <ExerciseMeta repetitions={exercise.repetitions} totalSeconds={totalSeconds} />

        <div className="flex items-center" style={{ gap: '8px' }}>
          {!exercise.isPreset && onEdit && (
            <button
              onClick={() => onEdit(exercise)}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary transition-colors"
              aria-label="Modifier"
            >
              <Pencil size={14} />
            </button>
          )}
          {!exercise.isPreset && onDelete && (
            <button
              onClick={() => onDelete(exercise.id)}
              className="p-2 rounded-lg text-text-muted hover:text-status-error transition-colors"
              aria-label="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          )}

          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent text-xs font-semibold text-text-inverse transition-opacity hover:opacity-90 active:opacity-75"
            style={{ paddingLeft: '14px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px' }}
          >
            Démarrer
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {showConfig && (
        <SessionConfigSheet
          exercise={exercise}
          onClose={() => setShowConfig(false)}
          onStart={(configured) => {
            setShowConfig(false)
            onStart(configured)
          }}
        />
      )}
    </div>
  )
}
