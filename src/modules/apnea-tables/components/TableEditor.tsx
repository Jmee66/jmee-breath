import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Wand2, Sliders, RefreshCw, LayoutList, ChevronDown, ChevronUp } from 'lucide-react'
import type { ApneaTable, TableType, RecoveryPattern, TableRow, CustomPhase, CustomPhaseType } from '../types'
import {
  generateRows, totalTableDuration, fmtTime,
  getPersonalBest, RECOVERY_CYCLE_S, CUSTOM_PHASE_CONFIG, defaultCustomPhases, customSeriesDuration,
} from '../services/tableGenerator'

// ── Constantes UI ─────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: TableType; label: string; desc: string }[] = [
  { value: 'co2',    label: 'CO₂',    desc: 'Hold fixe · récup décroissante · tolérance CO₂' },
  { value: 'o2',     label: 'O₂',     desc: 'Hold croissant · récup fixe · capacité' },
  { value: 'custom', label: 'Custom', desc: 'Table libre — définis chaque phase toi-même' },
]

const RECOVERY_OPTIONS: { value: RecoveryPattern; label: string }[] = [
  { value: 'soupir',      label: 'Soupir (3+7 s)' },
  { value: '6-6-12',     label: '6-6-12 s' },
  { value: 'co2-pattern', label: 'CO₂ pattern (4+2+10 s)' },
]

const PHASE_ORDER: CustomPhaseType[] = ['prep', 'inhale', 'hold', 'exhale', 'recovery', 'ventilation']

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
  const [recoveryPattern, setRecoveryPattern] = useState<RecoveryPattern>(
    initialTable?.recoveryPattern ?? 'soupir',
  )
  const [rows,            setRows]            = useState<TableRow[]>(
    initialTable?.rows ?? generateRows('co2', 90, 0, 8),
  )
  const [customPhases,    setCustomPhases]    = useState<CustomPhase[]>(
    initialTable?.customPhases ?? defaultCustomPhases(),
  )
  const [customSeries,    setCustomSeries]    = useState(initialTable?.customSeriesCount ?? 6)
  const [recoveryNote,    setRecoveryNote]    = useState(
    initialTable?.recoveryNote ?? 'Respire librement, récupère.',
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

  // ── Édition phases custom ───────────────────────────────────────────────────
  function updatePhase(phaseType: CustomPhaseType, field: keyof CustomPhase, value: string | number | boolean) {
    setCustomPhases((prev) => prev.map((p) => p.type === phaseType ? { ...p, [field]: value } : p))
  }

  function togglePhase(phaseType: CustomPhaseType) {
    setCustomPhases((prev) => {
      const existing = prev.find((p) => p.type === phaseType)
      if (existing) {
        return prev.map((p) => p.type === phaseType ? { ...p, enabled: !p.enabled } : p)
      }
      // Phase absente → l'ajouter avec les valeurs par défaut
      const cfg = CUSTOM_PHASE_CONFIG[phaseType]
      const newPhase: CustomPhase = {
        type:        phaseType,
        durationS:   cfg.defaultS,
        description: cfg.defaultDesc,
        enabled:     true,
      }
      return [...prev, newPhase]
    })
  }

  // ── Enregistrement ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        type,
        rows,
        referenceMaxS,
        seriesCount,
        recoveryPattern,
        formeFactor,
        customPhases:      type === 'custom' ? customPhases : undefined,
        customSeriesCount: type === 'custom' ? customSeries : undefined,
        recoveryNote:      type !== 'custom' ? recoveryNote : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const totalS  = type === 'custom'
    ? customSeriesDuration(customPhases) * customSeries
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

        {/* Éditeur custom */}
        {type === 'custom' && (
          <CustomEditor
            phases={customPhases}
            seriesCount={customSeries}
            totalS={totalS}
            onPhaseChange={updatePhase}
            onTogglePhase={togglePhase}
            onSeriesCountChange={setCustomSeries}
          />
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

// ── CustomEditor ───────────────────────────────────────────────────────────────

function CustomEditor({
  phases, seriesCount, onPhaseChange, onTogglePhase, onSeriesCountChange,
}: {
  phases:               CustomPhase[]
  seriesCount:          number
  totalS:               number
  onPhaseChange:        (phaseType: CustomPhaseType, field: keyof CustomPhase, value: string | number | boolean) => void
  onTogglePhase:        (phaseType: CustomPhaseType) => void
  onSeriesCountChange:  (n: number) => void
}) {
  const [expanded, setExpanded] = useState<CustomPhaseType | null>(null)

  const phaseMap = new Map(phases.map((p) => [p.type, p]))
  const seriesDuration = customSeriesDuration(phases)
  const grandTotal = seriesDuration * seriesCount

  return (
    <div className="space-y-4">

      {/* Durée totale — bloc dédié */}
      <div className="rounded-xl bg-bg-elevated border border-border px-4 py-3 space-y-1">
        <p className="text-xs text-text-muted">
          {seriesCount} série{seriesCount > 1 ? 's' : ''} × {fmtTime(seriesDuration)} / série
        </p>
        <p className="text-lg font-bold text-accent">{fmtTime(grandTotal)}</p>
      </div>

      {/* Séries */}
      <div className="flex items-center justify-between rounded-xl bg-bg-elevated border border-border px-4 py-3">
        <span className="text-sm font-semibold text-text-primary">Séries</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSeriesCountChange(Math.max(1, seriesCount - 1))}
            className="h-7 w-7 rounded-lg bg-bg-overlay text-white/70 font-bold text-xs"
          >−</button>
          <span className="w-6 text-center text-sm font-mono text-text-primary">{seriesCount}</span>
          <button
            onClick={() => onSeriesCountChange(Math.min(20, seriesCount + 1))}
            className="h-7 w-7 rounded-lg bg-bg-overlay text-white/70 font-bold text-xs"
          >+</button>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-text-muted flex items-center gap-1.5">
          <LayoutList size={12} />
          Phases par série
        </label>

        {PHASE_ORDER.map((phaseType) => {
          const cfg   = CUSTOM_PHASE_CONFIG[phaseType]
          const phase = phaseMap.get(phaseType) ?? {
            type: phaseType,
            durationS: cfg.defaultS,
            description: cfg.defaultDesc,
            enabled: false,
            repeatCount: 1,
          }
          const isExpanded = expanded === phaseType
          const repeatCount = phase.repeatCount ?? 1

          return (
            <div key={phaseType} className="rounded-xl bg-bg-elevated border border-border overflow-hidden">

              {/* ── Ligne 1 : toggle + label ── tap toute la ligne ── */}
              <button
                onClick={() => onTogglePhase(phaseType)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left"
              >
                {/* Pastille couleur */}
                <div
                  className="w-3 h-3 rounded-full shrink-0 transition-opacity"
                  style={{ backgroundColor: cfg.color, opacity: phase.enabled ? 1 : 0.25 }}
                />
                {/* Label */}
                <span className={`flex-1 text-sm font-semibold ${phase.enabled ? 'text-text-primary' : 'text-text-muted'}`}>
                  {cfg.label}
                </span>
                {/* Switch visuel */}
                <div className={`relative rounded-full transition-colors shrink-0 ${phase.enabled ? 'bg-accent' : 'bg-white/10'}`}
                  style={{ width: '2.5rem', height: '1.375rem' }}>
                  <span className={`absolute top-[3px] rounded-full bg-white shadow transition-all ${phase.enabled ? 'left-[17px]' : 'left-[3px]'}`}
                    style={{ width: '1rem', height: '1rem' }} />
                </div>
              </button>

              {/* ── Ligne 2 : durée + répétition (si enabled) ── */}
              {phase.enabled && (
                <div className="flex items-center gap-4 px-4 pb-3 border-t border-border/50 pt-3">
                  {/* Durée */}
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-text-muted w-12">Durée</span>
                    <button onClick={() => onPhaseChange(phaseType, 'durationS', Math.max(1, phase.durationS - 5))}
                      className="h-7 w-7 rounded-lg bg-bg-overlay text-white/70 font-bold text-xs flex items-center justify-center">−</button>
                    <span className="w-12 text-center text-sm font-mono text-text-primary">{phase.durationS}s</span>
                    <button onClick={() => onPhaseChange(phaseType, 'durationS', phase.durationS + 5)}
                      className="h-7 w-7 rounded-lg bg-bg-overlay text-white/70 font-bold text-xs flex items-center justify-center">+</button>
                  </div>
                  {/* Répétitions */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">×</span>
                    <button onClick={() => onPhaseChange(phaseType, 'repeatCount', Math.max(1, repeatCount - 1))}
                      className="h-7 w-7 rounded-lg bg-bg-overlay text-white/70 font-bold text-xs flex items-center justify-center">−</button>
                    <span className="w-6 text-center text-sm font-mono text-text-primary">{repeatCount}</span>
                    <button onClick={() => onPhaseChange(phaseType, 'repeatCount', Math.min(20, repeatCount + 1))}
                      className="h-7 w-7 rounded-lg bg-bg-overlay text-white/70 font-bold text-xs flex items-center justify-center">+</button>
                  </div>
                  {/* Expand description */}
                  <button onClick={() => setExpanded(isExpanded ? null : phaseType)}
                    className="p-1.5 text-text-muted hover:text-text-primary rounded-lg">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              )}

              {/* ── Zone description (expandable) ── */}
              {phase.enabled && isExpanded && (
                <div className="px-4 pb-4 pt-0">
                  <textarea
                    rows={2}
                    value={phase.description}
                    onChange={(e) => onPhaseChange(phaseType, 'description', e.target.value)}
                    placeholder="Instructions affichées pendant cette phase…"
                    className="w-full bg-bg-overlay rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-white/20 outline-none resize-none border border-border focus:border-accent"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
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
