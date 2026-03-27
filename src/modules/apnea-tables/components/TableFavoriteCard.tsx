import { ArrowUp, ArrowDown, GripVertical, Play, Heart, Clock, Layers } from 'lucide-react'
import type { ApneaTable } from '../types'
import { totalTableDuration, fmtTime, customProgramDuration } from '../services/tableGenerator'

// ── Labels & couleurs ─────────────────────────────────────────────────────────

const TYPE_LABEL: Record<ApneaTable['type'], string> = {
  co2:    'CO₂',
  o2:     'O₂',
  custom: 'Custom',
}
const TYPE_COLOR: Record<ApneaTable['type'], string> = {
  co2:    'text-purple-400 bg-purple-400/10 border-purple-400/20',
  o2:     'text-blue-400 bg-blue-400/10 border-blue-400/20',
  custom: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TableFavoriteCardProps {
  table:       ApneaTable
  isFirst:     boolean
  isLast:      boolean
  reorderMode: boolean
  onRun:       () => void
  onMoveUp:    () => void
  onMoveDown:  () => void
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function TableFavoriteCard({
  table, isFirst, isLast, reorderMode, onRun, onMoveUp, onMoveDown,
}: TableFavoriteCardProps) {
  const isCustom = table.type === 'custom'

  // Durée totale
  let totalS = 0
  if (isCustom) {
    if (table.customProgram && table.customProgram.length > 0) {
      totalS = customProgramDuration(table.customProgram)
    } else {
      totalS = (table.customPhases?.filter((p) => p.enabled).reduce((acc, p) => acc + p.durationS, 0) ?? 0)
             * (table.customSeriesCount ?? 0)
    }
  } else {
    totalS = totalTableDuration(table.rows)
  }

  const seriesCount = isCustom ? (table.customSeriesCount ?? 0) : table.rows.length
  const maxHold     = isCustom ? 0 : Math.max(...table.rows.map((r) => r.holdS), 1)

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
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${TYPE_COLOR[table.type]}`}>
              {TYPE_LABEL[table.type]}
            </span>
            <h3 className="text-sm font-semibold text-text-primary leading-snug truncate">
              {table.name}
            </h3>
          </div>
          {!reorderMode && (
            <Heart size={13} className="flex-shrink-0 mt-0.5 fill-status-error text-status-error" />
          )}
        </div>

        {/* Mini hold bars (CO₂/O₂ only) */}
        {!isCustom && table.rows.length > 0 && (
          <div className="flex items-end gap-0.5 h-6">
            {table.rows.map((row, i) => {
              const heightPct = maxHold > 0 ? (row.holdS / maxHold) * 100 : 50
              return (
                <div key={i} className="flex-1 flex flex-col justify-end">
                  <div
                    className="rounded-sm bg-accent/50"
                    style={{ height: `${Math.max(20, heightPct)}%` }}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* Stats + CTA */}
        <div className="flex items-center justify-between border-t border-border-subtle pt-2.5">
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Layers size={11} />
              {seriesCount} séries
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {fmtTime(totalS)}
            </span>
            {!isCustom && (
              <span>Max {fmtTime(maxHold)}</span>
            )}
          </div>

          {!reorderMode && (
            <button
              onClick={onRun}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-text-inverse hover:opacity-90 active:opacity-75 transition-opacity"
            >
              <Play size={11} fill="currentColor" />
              Démarrer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
