import { useState, useEffect, useCallback } from 'react'
import { Plus, Play, Trash2, ChevronRight, Clock, Layers } from 'lucide-react'
import type { ApneaTable } from '../types'
import { tableRepository } from '../services/tableRepository'
import { tableWriter } from '../services/tableWriter'
import { totalTableDuration, fmtTime } from '../services/tableGenerator'
import { TableEditor } from './TableEditor'
import { TableRunner } from './TableRunner'

const TYPE_LABEL: Record<ApneaTable['type'], string> = {
  co2: 'CO₂',
  o2:  'O₂',
  mix: 'Mix',
}
const TYPE_COLOR: Record<ApneaTable['type'], string> = {
  co2: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  o2:  'text-blue-400 bg-blue-400/10 border-blue-400/20',
  mix: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function ApneaTablesPage() {
  const [tables,      setTables]      = useState<ApneaTable[]>([])
  const [view,        setView]        = useState<'list' | 'editor' | 'runner'>('list')
  const [editTarget,  setEditTarget]  = useState<ApneaTable | null>(null)
  const [runTarget,   setRunTarget]   = useState<ApneaTable | null>(null)
  const [deleteId,    setDeleteId]    = useState<string | null>(null)

  const reload = useCallback(() => {
    void tableRepository.getAll().then(setTables)
  }, [])

  useEffect(() => { reload() }, [reload])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSave(data: Omit<ApneaTable, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>) {
    await tableWriter.save(data, editTarget?.id)
    setView('list')
    setEditTarget(null)
    reload()
  }

  async function handleDelete(id: string) {
    await tableWriter.delete(id)
    setDeleteId(null)
    reload()
  }

  function startRun(table: ApneaTable) {
    setRunTarget(table)
    setView('runner')
  }

  // ── Vues ──────────────────────────────────────────────────────────────────────

  if (view === 'editor') {
    return (
      <TableEditor
        initialTable={editTarget ?? undefined}
        onSave={handleSave}
        onCancel={() => { setView('list'); setEditTarget(null) }}
      />
    )
  }

  if (view === 'runner' && runTarget) {
    return (
      <TableRunner
        table={runTarget}
        onDone={() => { setView('list'); setRunTarget(null) }}
      />
    )
  }

  // ── Liste ─────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-bg-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Tables Apnée</h1>
          <p className="text-xs text-text-muted mt-0.5">CO₂ · O₂ · Mix</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setView('editor') }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-sm font-semibold shadow-lg"
        >
          <Plus size={16} />
          Créer
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
        {tables.length === 0 ? (
          <EmptyState onCreate={() => setView('editor')} />
        ) : (
          tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onRun={() => startRun(table)}
              onEdit={() => { setEditTarget(table); setView('editor') }}
              onDelete={() => setDeleteId(table.id)}
            />
          ))
        )}
      </div>

      {/* Confirm delete */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm rounded-2xl bg-bg-elevated border border-border p-6 space-y-4">
            <p className="text-text-primary font-semibold">Supprimer cette table ?</p>
            <p className="text-sm text-text-muted">Cette action est irréversible.</p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl bg-bg-overlay text-text-secondary text-sm font-semibold"
              >
                Annuler
              </button>
              <button
                onClick={() => void handleDelete(deleteId)}
                className="flex-1 py-2.5 rounded-xl bg-status-error text-white text-sm font-semibold"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TableCard ─────────────────────────────────────────────────────────────────

function TableCard({
  table, onRun, onEdit, onDelete,
}: {
  table:    ApneaTable
  onRun:    () => void
  onEdit:   () => void
  onDelete: () => void
}) {
  const total = totalTableDuration(table.rows)
  const maxHold = Math.max(...table.rows.map((r) => r.holdS))

  return (
    <div className="rounded-2xl bg-bg-elevated border border-border overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {/* Badge type */}
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${TYPE_COLOR[table.type]}`}>
          {TYPE_LABEL[table.type]}
        </span>
        <span className="flex-1 font-semibold text-text-primary truncate">{table.name}</span>
        <button
          onClick={onRun}
          className="h-9 w-9 flex items-center justify-center rounded-xl bg-accent text-white shadow"
        >
          <Play size={16} fill="white" />
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-4 pb-3 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <Layers size={11} />
          {table.rows.length} séries
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {fmtTime(total)}
        </span>
        <span>Max {fmtTime(maxHold)}</span>
      </div>

      {/* Mini preview (hold bars) */}
      <div className="flex items-end gap-0.5 px-4 pb-3 h-9">
        {table.rows.map((row, i) => {
          const heightPct = maxHold > 0 ? (row.holdS / maxHold) * 100 : 50
          return (
            <div key={i} className="flex-1 flex flex-col justify-end gap-0.5">
              <div
                className="rounded-sm bg-accent/60"
                style={{ height: `${Math.max(20, heightPct)}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex border-t border-border">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-muted hover:text-text-primary hover:bg-bg-overlay transition-colors"
        >
          <ChevronRight size={13} />
          Modifier
        </button>
        <div className="w-px bg-border" />
        <button
          onClick={onDelete}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-muted hover:text-status-error hover:bg-bg-overlay transition-colors"
        >
          <Trash2 size={13} />
          Supprimer
        </button>
      </div>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
        <Layers size={28} className="text-accent" />
      </div>
      <p className="text-text-primary font-semibold mb-1">Aucune table</p>
      <p className="text-sm text-text-muted mb-6">
        Crée une table CO₂, O₂ ou Mix pour entraîner ta tolérance et ta capacité.
      </p>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white font-semibold text-sm shadow-lg"
      >
        <Plus size={16} />
        Créer ma première table
      </button>
    </div>
  )
}
