import { ArrowUp, ArrowDown, GripVertical, Play, Heart, Clock, Wind } from 'lucide-react'
import type { CustomWarmup } from '../types/index'

export interface WarmupFavoriteCardProps {
  warmup:      CustomWarmup
  isFirst:     boolean
  isLast:      boolean
  reorderMode: boolean
  onStart:     () => void
  onMoveUp:    () => void
  onMoveDown:  () => void
}

export function WarmupFavoriteCard({ warmup, isFirst, isLast, reorderMode, onStart, onMoveUp, onMoveDown }: WarmupFavoriteCardProps) {
  const totalS = warmup.steps.reduce((s, step) => s + step.durationS, 0) + warmup.goDurationS
  const m = Math.floor(totalS / 60)
  const s = totalS % 60
  const durLabel = s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`

  return (
    <div className="card p-4 flex items-center gap-3">
      {reorderMode && (
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button onClick={onMoveUp} disabled={isFirst} className="flex h-6 w-6 items-center justify-center rounded text-text-muted disabled:opacity-20 hover:text-text-primary hover:bg-bg-overlay transition-colors">
            <ArrowUp size={13} />
          </button>
          <GripVertical size={13} className="text-text-muted mx-auto" />
          <button onClick={onMoveDown} disabled={isLast} className="flex h-6 w-6 items-center justify-center rounded text-text-muted disabled:opacity-20 hover:text-text-primary hover:bg-bg-overlay transition-colors">
            <ArrowDown size={13} />
          </button>
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border text-teal-400 bg-teal-400/10 border-teal-400/20 flex-shrink-0">
              Échauffement
            </span>
            <h3 className="text-sm font-semibold text-text-primary leading-snug truncate">{warmup.name}</h3>
          </div>
          {!reorderMode && <Heart size={13} className="flex-shrink-0 mt-0.5 fill-status-error text-status-error" />}
        </div>
        <div className="flex items-center justify-between border-t border-border-subtle pt-2.5">
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1"><Wind size={11} />{warmup.steps.length} étapes</span>
            <span className="flex items-center gap-1"><Clock size={11} />{durLabel}</span>
          </div>
          {!reorderMode && (
            <button onClick={onStart} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-text-inverse hover:opacity-90 active:opacity-75 transition-opacity">
              <Play size={11} fill="currentColor" />
              Démarrer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
