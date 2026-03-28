import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Wand2, Sliders, RefreshCw, X, ChevronDown, ChevronUp, Copy, Plus, Layers, Clipboard, ClipboardCheck, ArrowUpFromLine } from 'lucide-react'
import type { ApneaTable, TableType, RecoveryPattern, TableRow, CustomPhaseType, CustomItem, CustomPhaseItem, CustomGroupItem, ExerciseCategory } from '../types'
import {
  generateRows, totalTableDuration, fmtTime,
  getPersonalBest, CUSTOM_PHASE_CONFIG,
  defaultCustomProgram, migrateCustomPhases, customProgramDuration, genId,
} from '../services/tableGenerator'

// ── Constantes UI ─────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: TableType; label: string; desc: string }[] = [
  { value: 'co2',    label: 'CO₂',    desc: 'Hold fixe · récup décroissante · tolérance CO₂' },
  { value: 'o2',     label: 'O₂',     desc: 'Hold croissant · récup fixe · capacité' },
  { value: 'custom', label: 'Custom', desc: 'Table libre — définis chaque phase toi-même' },
]

const CATEGORY_OPTIONS: { value: ExerciseCategory; label: string }[] = [
  { value: 'apnea',         label: 'Apnée' },
  { value: 'breathing',     label: 'Respiration' },
  { value: 'preparation',   label: 'Préparation' },
  { value: 'meditation',    label: 'Méditation' },
  { value: 'visualization', label: 'Visualisation' },
  { value: 'panic',         label: 'Panique' },
  { value: 'warmup',        label: 'Échauffement' },
  { value: 'custom',        label: 'Personnalisé' },
]


// ── Composant principal ────────────────────────────────────────────────────────

interface Props {
  initialTable?: ApneaTable
  onSave:   (data: Omit<ApneaTable, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>) => Promise<void>
  onCancel: () => void
}

export function TableEditor({ initialTable, onSave, onCancel }: Props) {
  // ── Mode de config ──────────────────────────────────────────────────────────
  const [configMode, setConfigMode] = useState<'auto' | 'manual'>('auto')

  // ── Champs ──────────────────────────────────────────────────────────────────
  const [name,            setName]            = useState(initialTable?.name ?? '')
  const [type,            setType]            = useState<TableType>(initialTable?.type ?? 'co2')
  const [seriesCount,     setSeriesCount]     = useState(initialTable?.seriesCount ?? 8)
  const [referenceMaxS,   setReferenceMaxS]   = useState(initialTable?.referenceMaxS ?? 90)
  const [formeFactor,     setFormeFactor]     = useState(initialTable?.formeFactor ?? 0)
  const [recoveryPattern] = useState<RecoveryPattern>(
    initialTable?.recoveryPattern ?? 'soupir',
  )
  const [rows,            setRows]            = useState<TableRow[]>(
    initialTable?.rows ?? generateRows('co2', 90, 0, 8),
  )
  const [program, setProgram] = useState<CustomItem[]>(() => {
    if (initialTable?.customProgram) return initialTable.customProgram
    if (initialTable?.customPhases && initialTable.customSeriesCount) {
      return migrateCustomPhases(initialTable.customPhases, initialTable.customSeriesCount)
    }
    return defaultCustomProgram()
  })
  const [description,     setDescription]     = useState(initialTable?.description ?? '')
  const [recoveryNote,    setRecoveryNote]    = useState(
    initialTable?.recoveryNote ?? 'Respire librement, récupère.',
  )
  const [category, setCategory] = useState<ExerciseCategory>(
    initialTable?.category ?? 'apnea',
  )

  // ── Personal Best ───────────────────────────────────────────────────────────
  const [pb,      setPb]      = useState<number | null>(null)
  const [refMode, setRefMode] = useState<'pb' | 'custom'>('custom')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    void getPersonalBest().then((v) => {
      setPb(v)
      if (v && !initialTable) {
        setReferenceMaxS(v)
        setRefMode('pb')
      }
    })
  }, [initialTable])

  // ── Génération auto ─────────────────────────────────────────────────────────
  const regenerate = useCallback(() => {
    if (type !== 'custom') {
      setRows(generateRows(type, referenceMaxS, formeFactor, seriesCount))
    }
  }, [type, referenceMaxS, formeFactor, seriesCount])

  useEffect(() => {
    if (configMode === 'auto' && type !== 'custom') regenerate()
  }, [configMode, regenerate, type])

  // ── Édition manuelle d'une ligne ────────────────────────────────────────────
  function updateRow(i: number, field: keyof TableRow, value: number) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function addRow() {
    const last = rows[rows.length - 1]
    setRows((prev) => [...prev, { holdS: last?.holdS ?? 60, recoveryS: last?.recoveryS ?? 120 }])
  }
  function removeRow(i: number) {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  // ── Enregistrement ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        rows,
        referenceMaxS,
        seriesCount,
        recoveryPattern,
        formeFactor,
        category,
        customProgram: type === 'custom' ? program : undefined,
        recoveryNote:  type !== 'custom' ? recoveryNote : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const totalS = type === 'custom'
    ? customProgramDuration(program)
    : totalTableDuration(rows)

  const maxHold = type !== 'custom'
    ? Math.max(...rows.map((r) => r.holdS), 1)
    : 1

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-bg-base">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4 border-b border-border">
        <button onClick={onCancel} className="p-1.5 -ml-1 text-text-muted">
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 text-lg font-bold text-text-primary">
          {initialTable ? 'Modifier la table' : 'Nouvelle table'}
        </h1>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !name.trim()}
          className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40"
        >
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">

        {/* Nom */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">Nom</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ma table CO₂…"
            className="w-full rounded-xl bg-bg-elevated border border-border px-3 py-2.5 text-sm text-text-primary placeholder:text-white/25 outline-none focus:border-accent"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Objectif, consignes, contexte de cet exercice…"
            rows={3}
            className="w-full rounded-xl bg-bg-elevated border border-border px-3 py-2.5 text-sm text-text-primary placeholder:text-white/25 outline-none focus:border-accent resize-none"
          />
        </div>

        {/* Type */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`rounded-xl border py-3 text-sm font-bold transition-colors ${
                  type === t.value
                    ? 'bg-accent border-accent text-white'
                    : 'bg-bg-elevated border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted pl-1">
            {TYPE_OPTIONS.find((t) => t.value === type)?.desc}
          </p>
        </div>

        {/* Famille / Catégorie */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">Famille</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
            className="w-full rounded-xl bg-bg-elevated border border-border px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent appearance-none"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Éditeur custom */}
        {type === 'custom' && (
          <ProgramEditor program={program} onChange={setProgram} />
        )}

        {/* Config standard (CO2 / O2) */}
        {type !== 'custom' && (
          <>
            {/* Mode config */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">Configuration</label>
              <div className="flex rounded-xl overflow-hidden border border-border">
                {[
                  { value: 'auto',   label: 'Auto',   icon: Wand2 },
                  { value: 'manual', label: 'Manuel', icon: Sliders },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setConfigMode(value as 'auto' | 'manual')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${
                      configMode === value
                        ? 'bg-accent text-white'
                        : 'bg-bg-overlay text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Paramètres auto */}
            {configMode === 'auto' && (
              <div className="space-y-4 rounded-xl bg-bg-elevated border border-border p-4">

                {/* Référence */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                      Référence max
                    </label>
                    {pb && (
                      <button
                        onClick={() => { setRefMode('pb'); setReferenceMaxS(pb) }}
                        className={`text-[11px] px-2 py-0.5 rounded-lg border transition-colors ${
                          refMode === 'pb'
                            ? 'bg-accent/20 border-accent/40 text-accent'
                            : 'bg-bg-overlay border-border text-text-muted'
                        }`}
                      >
                        PB {fmtTime(pb)}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={20} max={360} step={5}
                      value={referenceMaxS}
                      onChange={(e) => { setRefMode('custom'); setReferenceMaxS(Number(e.target.value)) }}
                      className="flex-1 accent-accent"
                    />
                    <span className="w-14 text-right text-sm font-mono text-text-primary">
                      {fmtTime(referenceMaxS)}
                    </span>
                  </div>
                </div>

                {/* Séries */}
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Séries
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSeriesCount((n) => Math.max(2, n - 1))}
                      className="h-7 w-7 rounded-lg bg-bg-overlay text-white/70 font-bold text-xs"
                    >−</button>
                    <span className="w-6 text-center text-sm font-mono text-text-primary">{seriesCount}</span>
                    <button
                      onClick={() => setSeriesCount((n) => Math.min(16, n + 1))}
                      className="h-7 w-7 rounded-lg bg-bg-overlay text-white/70 font-bold text-xs"
                    >+</button>
                  </div>
                </div>

                {/* Forme du jour */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                      Forme du jour
                    </label>
                    <span className={`text-sm font-mono font-bold ${
                      formeFactor > 0 ? 'text-green-400' : formeFactor < 0 ? 'text-orange-400' : 'text-text-muted'
                    }`}>
                      {formeFactor > 0 ? '+' : ''}{Math.round(formeFactor * 100)} %
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-30} max={20} step={5}
                    value={Math.round(formeFactor * 100)}
                    onChange={(e) => setFormeFactor(Number(e.target.value) / 100)}
                    className="w-full accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span>Journée difficile</span>
                    <span>Forme normale</span>
                    <span>Très bonne forme</span>
                  </div>
                </div>

                {/* Recap ref effective */}
                <p className="text-[11px] text-text-muted text-center pt-1">
                  Référence effective :{' '}
                  <span className="font-semibold text-text-secondary">
                    {fmtTime(Math.round(referenceMaxS * (1 + formeFactor)))}
                  </span>
                </p>
              </div>
            )}

            {/* Note récupération libre — éditable */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Message récupération
              </label>
              <textarea
                rows={2}
                value={recoveryNote}
                onChange={(e) => setRecoveryNote(e.target.value)}
                placeholder="Ce qui s'affiche pendant la récupération…"
                className="w-full rounded-xl bg-bg-elevated border border-border px-3 py-2.5 text-sm text-text-primary placeholder:text-white/25 outline-none resize-none focus:border-accent"
              />
            </div>

            {/* Aperçu / éditeur manuel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Table ({rows.length} séries · {fmtTime(totalS)})
                </label>
                {configMode === 'auto' && (
                  <button
                    onClick={regenerate}
                    className="flex items-center gap-1 text-[11px] text-accent"
                  >
                    <RefreshCw size={11} />
                    Regénérer
                  </button>
                )}
              </div>

              {/* Barres hold visuelles */}
              <div className="flex items-end gap-0.5 h-12 bg-bg-elevated rounded-xl p-2">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-accent/50"
                    style={{ height: `${Math.max(15, (row.holdS / maxHold) * 100)}%` }}
                    title={`Hold ${fmtTime(row.holdS)}`}
                  />
                ))}
              </div>

              {/* Lignes éditables */}
              <div className="space-y-1.5">
                {rows.map((row, i) => (
                  <RowEditor
                    key={i}
                    index={i}
                    row={row}
                    total={rows.length}
                    editable={configMode === 'manual'}
                    onChange={(f, v) => updateRow(i, f, v)}
                    onRemove={() => removeRow(i)}
                  />
                ))}
              </div>

              {configMode === 'manual' && (
                <button
                  onClick={addRow}
                  className="w-full py-2 rounded-xl border border-dashed border-border text-xs text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors"
                >
                  + Ajouter une série
                </button>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── ProgramEditor ─────────────────────────────────────────────────────────────

function ProgramEditor({
  program, onChange,
}: {
  program:  CustomItem[]
  onChange: (items: CustomItem[]) => void
}) {
  const totalS = customProgramDuration(program)

  // ── Helpers programme ─────────────────────────────────────────────────────

  function updateItem(id: string, updated: CustomItem) {
    onChange(program.map((it) => it.id === id ? updated : it))
  }
  function removeItem(id: string) {
    onChange(program.filter((it) => it.id !== id))
  }
  function moveItem(id: string, dir: -1 | 1) {
    const idx = program.findIndex((it) => it.id === id)
    if (idx < 0) return
    const next = idx + dir
    if (next < 0 || next >= program.length) return
    const arr = [...program]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    onChange(arr)
  }
  function copyItem(id: string) {
    const idx = program.findIndex((it) => it.id === id)
    if (idx < 0) return
    const clone = deepCloneItem(program[idx])
    const arr = [...program]
    arr.splice(idx + 1, 0, clone)
    onChange(arr)
  }
  function addPhase() {
    const item: CustomPhaseItem = {
      id: genId(), kind: 'phase', phaseType: 'recovery',
      durationS: 120, description: CUSTOM_PHASE_CONFIG['recovery'].defaultDesc,
    }
    onChange([...program, item])
  }
  function addGroup() {
    const item: CustomGroupItem = {
      id: genId(), kind: 'group', label: 'Cycle', repeatCount: 3,
      items: (['inhale','hold','exhale','recovery'] as CustomPhaseType[]).map((t) => ({
        id: genId(), kind: 'phase' as const, phaseType: t,
        durationS: CUSTOM_PHASE_CONFIG[t].defaultS,
        description: CUSTOM_PHASE_CONFIG[t].defaultDesc,
      })),
    }
    onChange([...program, item])
  }

  // ── Bug 1: Phase-in-group mutations lifted to ProgramEditor ───────────────

  function updatePhaseInGroup(groupId: string, phaseId: string, upd: CustomPhaseItem) {
    onChange(program.map((it) => {
      if (it.id !== groupId || it.kind !== 'group') return it
      return { ...it, items: it.items.map((p) => p.id === phaseId ? upd : p) }
    }))
  }
  function removePhaseFromGroup(groupId: string, phaseId: string) {
    onChange(program.map((it) => {
      if (it.id !== groupId || it.kind !== 'group') return it
      if (it.items.length <= 1) return it
      return { ...it, items: it.items.filter((p) => p.id !== phaseId) }
    }))
  }
  function movePhaseInGroup(groupId: string, phaseId: string, dir: -1 | 1) {
    onChange(program.map((it) => {
      if (it.id !== groupId || it.kind !== 'group') return it
      const idx = it.items.findIndex((p) => p.id === phaseId)
      if (idx < 0) return it
      const next = idx + dir
      if (next < 0 || next >= it.items.length) return it
      const arr = [...it.items]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return { ...it, items: arr }
    }))
  }
  function copyPhaseInGroup(groupId: string, phaseId: string) {
    onChange(program.map((it) => {
      if (it.id !== groupId || it.kind !== 'group') return it
      const idx = it.items.findIndex((p) => p.id === phaseId)
      if (idx < 0) return it
      const clone: CustomPhaseItem = { ...it.items[idx], id: genId() }
      const arr = [...it.items]
      arr.splice(idx + 1, 0, clone)
      return { ...it, items: arr }
    }))
  }
  function addPhaseToGroup(groupId: string) {
    onChange(program.map((it) => {
      if (it.id !== groupId || it.kind !== 'group') return it
      const ph: CustomPhaseItem = {
        id: genId(), kind: 'phase', phaseType: 'recovery',
        durationS: 120, description: CUSTOM_PHASE_CONFIG['recovery'].defaultDesc,
      }
      return { ...it, items: [...it.items, ph] }
    }))
  }

  // ── Bug 2A: Extract phase from group ──────────────────────────────────────

  function extractPhaseFromGroup(groupId: string, phaseId: string) {
    const group = program.find((it) => it.id === groupId && it.kind === 'group') as CustomGroupItem | undefined
    if (!group) return
    const phase = group.items.find((p) => p.id === phaseId)
    if (!phase) return
    const extractedPhase: CustomPhaseItem = { ...phase, id: genId() }
    const newProgram = program.flatMap((it) => {
      if (it.id !== groupId || it.kind !== 'group') return [it]
      const newGroup = { ...it, items: it.items.filter((p) => p.id !== phaseId) }
      if (newGroup.items.length === 0) return [extractedPhase]
      return [newGroup, extractedPhase]
    })
    onChange(newProgram)
  }

  // ── Bug 2B: Wrap standalone phase in group ────────────────────────────────

  function wrapPhaseInGroup(phaseId: string) {
    onChange(program.map((it) => {
      if (it.id !== phaseId || it.kind !== 'phase') return it
      const group: CustomGroupItem = {
        id: genId(), kind: 'group', label: 'Cycle', repeatCount: 1,
        items: [{ ...it, id: genId() }],
      }
      return group
    }))
  }

  return (
    <div className="space-y-3">
      {/* Durée totale */}
      <div className="rounded-xl bg-bg-elevated border border-border px-4 py-3">
        <p className="text-xs text-text-muted">Durée totale du programme</p>
        <p className="text-2xl font-bold text-accent mt-0.5">{fmtTime(totalS)}</p>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {program.map((item, idx) => (
          item.kind === 'phase'
            ? <PhaseItemCard
                key={item.id} item={item} index={idx} total={program.length}
                onChange={(upd) => updateItem(item.id, upd)}
                onRemove={() => removeItem(item.id)}
                onMoveUp={() => moveItem(item.id, -1)}
                onMoveDown={() => moveItem(item.id, 1)}
                onCopy={() => copyItem(item.id)}
                onWrap={() => wrapPhaseInGroup(item.id)}
              />
            : <GroupItemCard
                key={item.id} item={item} index={idx} total={program.length}
                onChange={(upd) => updateItem(item.id, upd)}
                onRemove={() => removeItem(item.id)}
                onMoveUp={() => moveItem(item.id, -1)}
                onMoveDown={() => moveItem(item.id, 1)}
                onCopy={() => copyItem(item.id)}
                onUpdatePhase={(phaseId, upd) => updatePhaseInGroup(item.id, phaseId, upd)}
                onRemovePhase={(phaseId) => removePhaseFromGroup(item.id, phaseId)}
                onMovePhase={(phaseId, dir) => movePhaseInGroup(item.id, phaseId, dir)}
                onCopyPhase={(phaseId) => copyPhaseInGroup(item.id, phaseId)}
                onAddPhase={() => addPhaseToGroup(item.id)}
                onExtractPhase={(phaseId) => extractPhaseFromGroup(item.id, phaseId)}
              />
        ))}
      </div>

      {/* Boutons d'ajout */}
      <div className="flex gap-2">
        <button
          onClick={addPhase}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors"
        >
          <Plus size={14} /> Phase
        </button>
        <button
          onClick={addGroup}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-accent/30 text-sm text-accent/70 hover:text-accent hover:border-accent transition-colors"
        >
          <Layers size={14} /> Groupe
        </button>
      </div>
    </div>
  )
}

// ── PhaseItemCard ─────────────────────────────────────────────────────────────

function PhaseItemCard({
  item, index, total, onChange, onRemove, onMoveUp, onMoveDown, onCopy, onExtract, onWrap,
}: {
  item:        CustomPhaseItem
  index:       number
  total:       number
  onChange:    (upd: CustomPhaseItem) => void
  onRemove:    () => void
  onMoveUp:    () => void
  onMoveDown:  () => void
  onCopy:      () => void
  onExtract?:  () => void
  onWrap?:     () => void
}) {
  const [descOpen,  setDescOpen]  = useState(false)
  const [copied,    setCopied]    = useState(false)
  const cfg = CUSTOM_PHASE_CONFIG[item.phaseType]

  function copyDuration() {
    void navigator.clipboard.writeText(String(item.durationS))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  /** Formate en "Xs" ou "Xm Ys" pour l'affichage, avec précision 0.5s */
  function fmtDur(s: number) {
    if (s < 60) return `${s} s`
    const m = Math.floor(s / 60)
    const rem = Math.round((s % 60) * 2) / 2
    return rem === 0 ? `${m} min` : `${m}m ${rem}s`
  }

  return (
    <div className="rounded-xl bg-bg-elevated border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3">
        {/* Reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} className="p-0.5 text-white/30 hover:text-white/70 disabled:opacity-20">
            <ChevronUp size={11} />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 text-white/30 hover:text-white/70 disabled:opacity-20">
            <ChevronDown size={11} />
          </button>
        </div>

        {/* Type picker */}
        <div className="flex gap-1 flex-wrap flex-1">
          {(Object.keys(CUSTOM_PHASE_CONFIG) as CustomPhaseType[]).map((t) => {
            const c = CUSTOM_PHASE_CONFIG[t]
            const active = item.phaseType === t
            return (
              <button
                key={t}
                onClick={() => onChange({ ...item, phaseType: t, description: active ? item.description : c.defaultDesc })}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors border ${
                  active
                    ? 'text-white border-transparent'
                    : 'text-white/30 border-transparent hover:text-white/60'
                }`}
                style={active ? { backgroundColor: c.color + '33', borderColor: c.color + '60', color: c.color } : {}}
              >
                {c.label}
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {onExtract && (
            <button onClick={onExtract} title="Extraire du groupe" className="p-1.5 text-white/30 hover:text-accent rounded-lg">
              <ArrowUpFromLine size={13} />
            </button>
          )}
          {onWrap && (
            <button onClick={onWrap} title="Grouper" className="p-1.5 text-white/30 hover:text-accent rounded-lg">
              <Layers size={13} />
            </button>
          )}
          <button onClick={() => setDescOpen(!descOpen)} className="p-1.5 text-white/30 hover:text-white/60 rounded-lg">
            {descOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button onClick={onCopy} className="p-1.5 text-white/30 hover:text-white/60 rounded-lg">
            <Copy size={13} />
          </button>
          <button onClick={onRemove} className="p-1.5 text-white/30 hover:text-status-error rounded-lg">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Durée */}
      <div className="flex items-center gap-2 px-3 pb-3 border-t border-border/40 pt-2.5">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
        <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>

        {/* Stepper ± 0.5 s */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => onChange({ ...item, durationS: Math.max(0.5, Math.round((item.durationS - 0.5) * 2) / 2) })}
            className="h-7 w-7 rounded-lg bg-bg-overlay text-white/60 font-bold text-xs flex items-center justify-center select-none"
          >−</button>
          <input
            type="number" min={0.5} max={3600} step={0.5}
            value={item.durationS}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 0.5) onChange({ ...item, durationS: Math.round(v * 2) / 2 })
            }}
            className="w-16 text-center text-sm font-mono bg-transparent text-text-primary outline-none border-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs text-white/40 -ml-1">s</span>
          <button
            onClick={() => onChange({ ...item, durationS: Math.round((item.durationS + 0.5) * 2) / 2 })}
            className="h-7 w-7 rounded-lg bg-bg-overlay text-white/60 font-bold text-xs flex items-center justify-center select-none"
          >+</button>

          {/* Copier durée */}
          <button
            onClick={copyDuration}
            title="Copier la durée"
            className={`p-1.5 rounded-lg transition-colors ${copied ? 'text-green-400' : 'text-white/30 hover:text-white/60'}`}
          >
            {copied ? <ClipboardCheck size={13} /> : <Clipboard size={13} />}
          </button>
        </div>

        {/* Affichage lisible */}
        <span className="text-xs text-white/30 w-14 text-right shrink-0">{fmtDur(item.durationS)}</span>
      </div>

      {/* Toggle chiffres — visible directement pour countdown, sans ouvrir la description */}
      {item.phaseType === 'countdown' && (
        <div className="flex items-center justify-between px-3 pb-2.5">
          <span className="text-xs text-text-muted">Chiffres du décompte</span>
          <button
            role="switch"
            aria-checked={item.showNumbers !== false}
            onClick={() => onChange({ ...item, showNumbers: !(item.showNumbers !== false) })}
            style={{
              width: '32px', height: '18px', borderRadius: '9px', border: 'none',
              background: item.showNumbers !== false ? 'var(--color-accent)' : 'var(--color-bg-overlay)',
              position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: '2px',
              left: item.showNumbers !== false ? '16px' : '2px',
              width: '14px', height: '14px', borderRadius: '50%',
              background: 'white', transition: 'left 0.2s',
            }} />
          </button>
        </div>
      )}

      {/* Description */}
      {descOpen && (
        <div className="px-3 pb-3">
          <textarea rows={2} value={item.description}
            onChange={(e) => onChange({ ...item, description: e.target.value })}
            placeholder="Instruction affichée pendant cette phase…"
            className="w-full bg-bg-overlay rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-white/20 outline-none resize-none border border-border focus:border-accent" />
        </div>
      )}
    </div>
  )
}

// ── GroupItemCard ─────────────────────────────────────────────────────────────

function GroupItemCard({
  item, index, total, onChange, onRemove, onMoveUp, onMoveDown, onCopy,
  onUpdatePhase, onRemovePhase, onMovePhase, onCopyPhase, onAddPhase, onExtractPhase,
}: {
  item:           CustomGroupItem
  index:          number
  total:          number
  onChange:       (upd: CustomGroupItem) => void
  onRemove:       () => void
  onMoveUp:       () => void
  onMoveDown:     () => void
  onCopy:         () => void
  onUpdatePhase:  (phaseId: string, upd: CustomPhaseItem) => void
  onRemovePhase:  (phaseId: string) => void
  onMovePhase:    (phaseId: string, dir: -1 | 1) => void
  onCopyPhase:    (phaseId: string) => void
  onAddPhase:     () => void
  onExtractPhase: (phaseId: string) => void
}) {
  const [open, setOpen] = useState(true)
  const groupDurationS  = item.items.reduce((s, p) => s + p.durationS, 0)
  const totalDurationS  = groupDurationS * item.repeatCount

  return (
    <div className="rounded-xl border border-accent/30 bg-bg-elevated overflow-hidden">
      {/* En-tête groupe */}
      <div className="flex items-center gap-2 px-3 py-3 bg-accent/5">
        {/* Reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} className="p-0.5 text-white/30 hover:text-white/70 disabled:opacity-20">
            <ChevronUp size={11} />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 text-white/30 hover:text-white/70 disabled:opacity-20">
            <ChevronDown size={11} />
          </button>
        </div>

        {/* Icône groupe */}
        <Layers size={14} className="text-accent/60 shrink-0" />

        {/* Label éditable */}
        <input
          value={item.label}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-text-primary outline-none border-none placeholder:text-white/25"
          placeholder="Nom du groupe…"
        />

        {/* Répétitions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onChange({ ...item, repeatCount: Math.max(1, item.repeatCount - 1) })}
            className="h-7 w-7 rounded-lg bg-bg-overlay text-white/60 font-bold text-xs flex items-center justify-center">−</button>
          <span className="w-6 text-center text-sm font-mono text-accent font-bold">{item.repeatCount}</span>
          <button onClick={() => onChange({ ...item, repeatCount: item.repeatCount + 1 })}
            className="h-7 w-7 rounded-lg bg-bg-overlay text-white/60 font-bold text-xs flex items-center justify-center">+</button>
          <span className="text-xs text-white/40 ml-0.5">×</span>
        </div>

        {/* Durée */}
        <span className="text-xs text-text-muted shrink-0">{fmtTime(totalDurationS)}</span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <button onClick={() => setOpen(!open)} className="p-1.5 text-white/40 hover:text-white/70 rounded-lg">
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button onClick={onCopy} className="p-1.5 text-white/30 hover:text-white/60 rounded-lg">
            <Copy size={13} />
          </button>
          <button onClick={onRemove} className="p-1.5 text-white/30 hover:text-status-error rounded-lg">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Phases du groupe */}
      {open && (
        <div className="px-3 py-2 space-y-1.5 border-t border-accent/20">
          {item.items.map((phase, pIdx) => (
            <PhaseItemCard
              key={phase.id} item={phase} index={pIdx} total={item.items.length}
              onChange={(upd) => onUpdatePhase(phase.id, upd)}
              onRemove={() => onRemovePhase(phase.id)}
              onMoveUp={() => onMovePhase(phase.id, -1)}
              onMoveDown={() => onMovePhase(phase.id, 1)}
              onCopy={() => onCopyPhase(phase.id)}
              onExtract={() => onExtractPhase(phase.id)}
            />
          ))}
          <button onClick={onAddPhase}
            className="w-full py-2 rounded-lg border border-dashed border-border/60 text-xs text-text-muted hover:text-text-primary hover:border-accent/40 transition-colors">
            + Phase
          </button>
        </div>
      )}
    </div>
  )
}

// ── deepCloneItem ─────────────────────────────────────────────────────────────

function deepCloneItem(item: CustomItem): CustomItem {
  if (item.kind === 'phase') return { ...item, id: genId() }
  return {
    ...item,
    id: genId(),
    items: item.items.map((p) => ({ ...p, id: genId() })),
  }
}

// ── RowEditor ─────────────────────────────────────────────────────────────────

function RowEditor({
  index, row, total, editable, onChange, onRemove,
}: {
  index:    number
  row:      TableRow
  total:    number
  editable: boolean
  onChange: (field: keyof TableRow, value: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-elevated border border-border">
      <span className="w-5 text-[11px] text-text-muted text-center font-mono">{index + 1}</span>

      {/* Hold */}
      <div className="flex-1 flex items-center gap-1.5">
        <span className="text-[10px] text-blue-400/70 w-10 shrink-0">Hold</span>
        {editable ? (
          <TimeInput value={row.holdS} onChange={(v) => onChange('holdS', v)} />
        ) : (
          <span className="text-sm font-mono text-text-primary">{fmtTime(row.holdS)}</span>
        )}
      </div>

      <div className="w-px h-4 bg-border" />

      {/* Recovery */}
      <div className="flex-1 flex items-center gap-1.5">
        <span className="text-[10px] text-green-400/70 w-10 shrink-0">Récup</span>
        {editable ? (
          <TimeInput value={row.recoveryS} onChange={(v) => onChange('recoveryS', v)} />
        ) : (
          <span className="text-sm font-mono text-text-primary">{fmtTime(row.recoveryS)}</span>
        )}
      </div>

      {editable && (
        <button
          onClick={onRemove}
          disabled={total <= 1}
          className="p-1 text-white/25 hover:text-status-error disabled:opacity-10"
        >✕</button>
      )}
    </div>
  )
}

// ── TimeInput ─────────────────────────────────────────────────────────────────

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const m = Math.floor(value / 60)
  const s = value % 60

  function setMin(v: number) { onChange(Math.max(0, v) * 60 + s) }
  function setSec(v: number) { onChange(m * 60 + Math.max(0, Math.min(59, v))) }

  return (
    <div className="flex items-center gap-0.5 text-sm font-mono">
      <input
        type="number" min={0} max={59} value={m}
        onChange={(e) => setMin(Number(e.target.value))}
        className="w-7 text-center bg-transparent text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-white/30">:</span>
      <input
        type="number" min={0} max={59} value={String(s).padStart(2, '0')}
        onChange={(e) => setSec(Number(e.target.value))}
        className="w-7 text-center bg-transparent text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  )
}
