/**
 * CustomWarmupEditor — éditeur d'échauffements personnalisés.
 *
 * Chaque étape dispose de deux modes :
 *  · Ratio   : pattern prédéfini (soupir, 6-6-12, co2…)
 *  · Libre   : cycle entièrement personnalisé (Inspir / Rétention / Expir / Vide)
 *
 * Toutes les durées sont éditables par paliers de 0,5 s (stepper) ou en saisie libre.
 */

import { useState } from 'react'
import { Plus, X, Save, ChevronDown, ChevronUp, Timer, ArrowDown } from 'lucide-react'
import type { CustomWarmup, CustomWarmupStep, CustomCycle, WarmupBreathPattern, WarmupStepType } from '../types'

// ── Pattern catalogue (mode ratio) ────────────────────────────────────────────

interface PatternInfo {
  label:          string
  type:           WarmupStepType
  cycleS:         number | null   // null = phase unique
  defaultDuration: number
  hint:           string
  defaultCycle:   CustomCycle     // fallback si switch vers mode libre
}

const PATTERN_CATALOGUE: Record<Exclude<WarmupBreathPattern, 'go' | 'custom'>, PatternInfo> = {
  'soupir':          { label: 'Soupir (3+7)',               type: 'breathe',  cycleS: 10,   defaultDuration: 60,  hint: 'Inspir 3s · Expir 7s — cycle 10s',              defaultCycle: { inhale: 3,  hold: 0, exhale: 7,  holdEmpty: 0 } },
  'soupir-cyclique': { label: 'Soupir Cyclique (4+2+6+12)', type: 'breathe',  cycleS: 24,   defaultDuration: 48,  hint: 'Inspir · Inspir rapide · Rétention · Expir — 24s', defaultCycle: { inhale: 4,  hold: 6, exhale: 12, holdEmpty: 0 } },
  '6-6-12':          { label: 'Cohérence 6-6-12',           type: 'breathe',  cycleS: 24,   defaultDuration: 72,  hint: 'Inspir 6s · Rétention 6s · Expir 12s — cycle 24s', defaultCycle: { inhale: 6,  hold: 6, exhale: 12, holdEmpty: 0 } },
  'co2':             { label: 'CO₂ Ocean Breath (4-8-16-4)', type: 'co2',     cycleS: 32,   defaultDuration: 64,  hint: 'Inspir 4s · Rét. 8s · Expir 16s · Vide 4s — 32s', defaultCycle: { inhale: 4,  hold: 8, exhale: 16, holdEmpty: 4 } },
  'inhale':          { label: 'Inspiration seule',           type: 'inhale',   cycleS: null, defaultDuration: 6,   hint: 'Inspiration progressive sur la durée choisie',      defaultCycle: { inhale: 6,  hold: 0, exhale: 0,  holdEmpty: 0 } },
  'exhale':          { label: 'Expiration seule',            type: 'exhale',   cycleS: null, defaultDuration: 6,   hint: 'Expiration progressive sur la durée choisie',       defaultCycle: { inhale: 0,  hold: 0, exhale: 6,  holdEmpty: 0 } },
  'hold-full':       { label: 'Rétention pleine',            type: 'hold',     cycleS: null, defaultDuration: 30,  hint: 'Apnée poumons pleins',                              defaultCycle: { inhale: 0,  hold: 30, exhale: 0, holdEmpty: 0 } },
  'hold-empty':      { label: 'Apnée vide (FRC)',            type: 'hold',     cycleS: null, defaultDuration: 30,  hint: 'Apnée poumons vides — réveille la rate',            defaultCycle: { inhale: 0,  hold: 0,  exhale: 0, holdEmpty: 30 } },
  'countdown':       { label: 'Compte à rebours',            type: 'hold',     cycleS: null, defaultDuration: 10,  hint: 'Cercle se vide progressivement',                    defaultCycle: { inhale: 0,  hold: 10, exhale: 0, holdEmpty: 0 } },
}

const PATTERN_OPTIONS = Object.keys(PATTERN_CATALOGUE) as Array<Exclude<WarmupBreathPattern, 'go' | 'custom'>>

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Arrondi au 0,5 s le plus proche, entre min et 3600 */
function snap(v: number, min = 0.5): number {
  return Math.max(min, Math.min(3600, Math.round(v * 2) / 2))
}

function cycleSeconds(c: CustomCycle): number {
  return c.inhale + c.hold + c.exhale + c.holdEmpty
}

function formatDur(s: number): string {
  return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`
}

function formatTotalDuration(steps: CustomWarmupStep[], goDurationS: number): string {
  const total = steps.reduce((acc, st) => acc + st.durationS, 0) + goDurationS
  const m = Math.floor(total / 60)
  const s = total % 60
  const sStr = formatDur(s)
  if (m === 0) return sStr
  return s === 0 ? `${m} min` : `${m} min ${sStr}`
}

// ── Ligne de phase uniforme (mode Libre) ─────────────────────────────────────
// Toutes les lignes partagent la même grille :
//   [zone label w-20] [− w-6] [input w-12] [s] [+ w-6]
// Pour les phases optionnelles, le label est un bouton toggle.

function PhaseRow({
  label,
  value,
  onChange,
  optional = false,
  active    = true,
  onToggle,
}: {
  label:     string
  value:     number
  onChange:  (v: number) => void
  optional?: boolean
  active?:   boolean
  onToggle?: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Label / toggle — largeur fixe pour aligner toutes les colonnes */}
      {optional ? (
        <button
          onClick={onToggle}
          className={`w-20 shrink-0 text-left text-[11px] leading-none transition-colors ${
            active ? 'text-white/60' : 'text-white/30 italic'
          }`}
        >
          {active ? label : `+ ${label}`}
        </button>
      ) : (
        <span className="w-20 shrink-0 text-[11px] leading-none text-white/60">{label}</span>
      )}

      {/* Contrôles — toujours à la même position horizontale */}
      {active ? (
        <>
          <button
            onClick={() => onChange(snap(value - 0.5, 0.5))}
            disabled={value <= 0.5}
            className="h-6 w-6 flex items-center justify-center rounded-md bg-bg-overlay text-white/60 hover:text-white hover:bg-bg-overlay/80 active:scale-95 disabled:opacity-20 transition-all text-sm font-bold shrink-0"
          >−</button>
          <input
            type="number"
            min={0.5}
            max={3600}
            step={0.5}
            value={value}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) onChange(snap(v, 0.5))
            }}
            className="w-12 text-center text-xs font-mono bg-transparent text-text-primary outline-none border-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[11px] text-white/40">s</span>
          <button
            onClick={() => onChange(snap(value + 0.5, 0.5))}
            className="h-6 w-6 flex items-center justify-center rounded-md bg-bg-overlay text-white/60 hover:text-white hover:bg-bg-overlay/80 active:scale-95 transition-all text-sm font-bold shrink-0"
          >+</button>
        </>
      ) : (
        <span className="text-[11px] text-white/20">—</span>
      )}
    </div>
  )
}

// ── Stepper standard (GO / Récup) ─────────────────────────────────────────────

function DurationStepper({
  value, onChange, step = 0.5, min = 0.5, max = 600,
}: {
  value: number; onChange: (v: number) => void
  step?: number; min?: number; max?: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(snap(value - step, min))}
        className="h-8 w-8 flex items-center justify-center rounded-lg bg-bg-overlay text-white/70 hover:bg-bg-overlay/80 active:scale-95 transition-transform font-bold"
      >−</button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(snap(v, min))
        }}
        className="w-14 text-center text-sm font-mono bg-transparent text-text-primary outline-none border-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-xs text-white/50">s</span>
      <button
        onClick={() => onChange(snap(value + step, min))}
        className="h-8 w-8 flex items-center justify-center rounded-lg bg-bg-overlay text-white/70 hover:bg-bg-overlay/80 active:scale-95 transition-transform font-bold"
      >+</button>
    </div>
  )
}

// ── LibrePhaseEditor ──────────────────────────────────────────────────────────

const DEFAULT_CYCLE: CustomCycle = { inhale: 4, hold: 0, exhale: 8, holdEmpty: 0 }

function LibrePhaseEditor({
  cycle,
  onChange,
}: {
  cycle:    CustomCycle
  onChange: (c: CustomCycle) => void
}) {
  const totalS = cycleSeconds(cycle)

  return (
    <div className="space-y-1.5 pl-6 pt-1">
      <PhaseRow
        label="Inspir"
        value={cycle.inhale || 0.5}
        onChange={(v) => onChange({ ...cycle, inhale: v })}
      />
      <PhaseRow
        label="Rétention"
        value={cycle.hold || 4}
        onChange={(v) => onChange({ ...cycle, hold: v })}
        optional
        active={cycle.hold > 0}
        onToggle={() => onChange({ ...cycle, hold: cycle.hold > 0 ? 0 : 4 })}
      />
      <PhaseRow
        label="Expir"
        value={cycle.exhale || 0.5}
        onChange={(v) => onChange({ ...cycle, exhale: v })}
      />
      <PhaseRow
        label="Vide"
        value={cycle.holdEmpty || 4}
        onChange={(v) => onChange({ ...cycle, holdEmpty: v })}
        optional
        active={cycle.holdEmpty > 0}
        onToggle={() => onChange({ ...cycle, holdEmpty: cycle.holdEmpty > 0 ? 0 : 4 })}
      />

      {totalS > 0 && (
        <p className="text-[10px] text-white/25 pt-0.5">
          Cycle : {formatDur(totalS)}
        </p>
      )}
    </div>
  )
}

// ── StepRow ───────────────────────────────────────────────────────────────────

function StepRow({
  step, index, total, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  step:       CustomWarmupStep
  index:      number
  total:      number
  onChange:   (updated: CustomWarmupStep) => void
  onRemove:   () => void
  onMoveUp:   () => void
  onMoveDown: () => void
}) {
  const isLibre = step.mode === 'libre'
  const cycle   = step.customCycle ?? DEFAULT_CYCLE

  // Cycle hint (ratio mode)
  const ratioInfo   = isLibre ? null : PATTERN_CATALOGUE[step.pattern as Exclude<WarmupBreathPattern, 'go' | 'custom'>] ?? null
  const cycleHint   = !isLibre && ratioInfo?.cycleS
    ? `${Math.ceil(step.durationS / ratioInfo.cycleS)} cycle${Math.ceil(step.durationS / ratioInfo.cycleS) > 1 ? 's' : ''}`
    : null

  // Cycle hint (libre mode)
  const libCycleS   = isLibre ? cycleSeconds(cycle) : 0
  const libNCycles  = libCycleS > 0 ? Math.ceil(step.durationS / libCycleS) : 0

  function switchMode(mode: 'ratio' | 'libre') {
    if (mode === 'libre') {
      const base = ratioInfo?.defaultCycle ?? DEFAULT_CYCLE
      onChange({ ...step, mode: 'libre', customCycle: base, pattern: 'custom', type: 'breathe' })
    } else {
      onChange({ ...step, mode: 'ratio', customCycle: undefined, pattern: 'soupir', type: 'breathe' })
    }
  }

  return (
    <div className="rounded-xl bg-bg-elevated border border-border p-3 space-y-2.5">

      {/* ── Ligne 1 : reorder · mode toggle · durée totale · supprimer ── */}
      <div className="flex items-center gap-2">

        {/* Reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={onMoveUp}   disabled={index === 0}          className="p-0.5 text-white/30 hover:text-white/70 disabled:opacity-20"><ChevronUp size={12} /></button>
          <button onClick={onMoveDown} disabled={index === total - 1}   className="p-0.5 text-white/30 hover:text-white/70 disabled:opacity-20"><ChevronDown size={12} /></button>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
          {(['ratio', 'libre'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                step.mode === m
                  ? 'bg-accent text-white'
                  : 'bg-bg-overlay text-white/40 hover:text-white/70'
              }`}
            >
              {m === 'ratio' ? 'Ratio' : 'Libre'}
            </button>
          ))}
        </div>

        {/* Durée totale */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={() => onChange({ ...step, durationS: snap(step.durationS - 0.5) })}
            className="h-7 w-7 flex items-center justify-center rounded-lg bg-bg-overlay text-white/70 hover:bg-bg-overlay/80 active:scale-95 text-xs font-bold"
          >−</button>
          <input
            type="number"
            min={0.5}
            max={3600}
            step={0.5}
            value={step.durationS}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) onChange({ ...step, durationS: snap(v) })
            }}
            className="w-12 text-center text-xs font-mono bg-transparent text-text-primary outline-none border-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[11px] text-white/40">s</span>
          <button
            onClick={() => onChange({ ...step, durationS: snap(step.durationS + 0.5) })}
            className="h-7 w-7 flex items-center justify-center rounded-lg bg-bg-overlay text-white/70 hover:bg-bg-overlay/80 active:scale-95 text-xs font-bold"
          >+</button>
        </div>

        {/* Supprimer */}
        <button
          onClick={onRemove}
          disabled={total <= 1}
          className="p-1 text-white/30 hover:text-status-error disabled:opacity-20"
        ><X size={13} /></button>
      </div>

      {/* ── Ligne 2 : contenu selon mode ── */}
      {isLibre ? (
        <>
          <LibrePhaseEditor
            cycle={cycle}
            onChange={(c) => onChange({ ...step, customCycle: c })}
          />
          {libNCycles > 0 && (
            <p className="pl-6 text-[10px] text-white/25">
              ≈ {libNCycles} cycle{libNCycles > 1 ? 's' : ''} sur {formatDur(step.durationS)}
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 pl-6">
          <select
            value={step.pattern}
            onChange={(e) => {
              const p = e.target.value as Exclude<WarmupBreathPattern, 'go' | 'custom'>
              onChange({ ...step, pattern: p, type: PATTERN_CATALOGUE[p]?.type ?? 'breathe' })
            }}
            className="flex-1 min-w-0 rounded-lg bg-bg-overlay border border-border px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
          >
            {PATTERN_OPTIONS.map((p) => (
              <option key={p} value={p} className="bg-bg-elevated">
                {PATTERN_CATALOGUE[p].label}
              </option>
            ))}
          </select>
          {cycleHint && (
            <span className="text-[10px] text-white/30 shrink-0">{cycleHint}</span>
          )}
        </div>
      )}

      {/* ── Ligne 3 : label + instruction ── */}
      <div className="flex items-center gap-2 pl-6">
        <input
          type="text"
          placeholder="Label court"
          value={step.phaseName}
          onChange={(e) => onChange({ ...step, phaseName: e.target.value })}
          className="w-24 shrink-0 rounded-lg bg-bg-overlay border border-transparent px-2 py-1 text-xs text-text-primary placeholder:text-white/25 outline-none focus:border-accent/50"
        />
        <input
          type="text"
          placeholder="Instruction affichée..."
          value={step.instruction}
          onChange={(e) => onChange({ ...step, instruction: e.target.value })}
          className="flex-1 min-w-0 rounded-lg bg-bg-overlay border border-transparent px-2 py-1 text-xs text-text-primary placeholder:text-white/25 outline-none focus:border-accent/50"
        />
      </div>

      {/* Hint (ratio uniquement) */}
      {!isLibre && ratioInfo && (
        <p className="pl-6 text-[10px] text-white/20 leading-tight">{ratioInfo.hint}</p>
      )}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CustomWarmupEditorProps {
  initialWarmup?: CustomWarmup
  onSave:   (data: Omit<CustomWarmup, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>) => Promise<void>
  onCancel: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomWarmupEditor({ initialWarmup, onSave, onCancel }: CustomWarmupEditorProps) {
  const [name, setName] = useState(initialWarmup?.name ?? '')
  const [steps, setSteps] = useState<CustomWarmupStep[]>(
    initialWarmup?.steps ?? [
      {
        id:          crypto.randomUUID(),
        mode:        'ratio',
        pattern:     '6-6-12',
        durationS:   72,
        phaseName:   'Détente',
        instruction: 'Respiration 6-6-12 : calme le système nerveux',
        type:        'breathe',
      },
    ]
  )
  const [goDurationS,         setGoDurationS]         = useState(initialWarmup?.goDurationS         ?? 3)
  const [recoveryPattern,     setRecoveryPattern]     = useState<WarmupBreathPattern>(initialWarmup?.recoveryPattern     ?? 'soupir')
  const [recoveryDurationS,   setRecoveryDurationS]   = useState(initialWarmup?.recoveryDurationS   ?? 60)
  const [recoveryInstruction, setRecoveryInstruction] = useState(initialWarmup?.recoveryInstruction ?? 'Récupération calme post-apnée')
  const [isSaving,            setIsSaving]            = useState(false)

  const totalLabel = formatTotalDuration(steps, goDurationS)

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleAddStep() {
    setSteps((prev) => [
      ...prev,
      {
        id:          crypto.randomUUID(),
        mode:        'ratio',
        pattern:     'soupir',
        durationS:   60,
        phaseName:   '',
        instruction: '',
        type:        'breathe',
      },
    ])
  }

  function handleChangeStep(id: string, updated: CustomWarmupStep) {
    setSteps((prev) => prev.map((s) => s.id === id ? updated : s))
  }

  function handleRemoveStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }

  function handleMoveUp(index: number) {
    if (index === 0) return
    setSteps((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function handleMoveDown(index: number) {
    setSteps((prev) => {
      if (index === prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim() || steps.length === 0) return
    setIsSaving(true)
    try {
      await onSave({
        name:                name.trim(),
        steps,
        goDurationS,
        recoveryPattern,
        recoveryDurationS,
        recoveryInstruction: recoveryInstruction.trim(),
      })
    } finally {
      setIsSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--color-bg-base)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--color-bg-base)',
        borderBottom: '1px solid var(--color-border)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p className="text-base font-semibold text-text-primary">
            {initialWarmup ? "Modifier l'échauffement" : 'Nouvel échauffement'}
          </p>
          <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
            <Timer size={11} />
            Durée totale : <span className="font-medium text-accent">{totalLabel}</span>
          </p>
        </div>
        <button
          onClick={onCancel}
          className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-6 max-w-xl mx-auto w-full pb-8">

        {/* Nom */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Nom de l'échauffement
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Mon 5 minutes perso"
            className="w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-white/30 border border-border focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        {/* Étapes */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Étapes de respiration
          </label>

          <div className="space-y-2">
            {steps.map((step, idx) => (
              <StepRow
                key={step.id}
                step={step}
                index={idx}
                total={steps.length}
                onChange={(updated) => handleChangeStep(step.id, updated)}
                onRemove={() => handleRemoveStep(step.id)}
                onMoveUp={() => handleMoveUp(idx)}
                onMoveDown={() => handleMoveDown(idx)}
              />
            ))}
          </div>

          <button
            onClick={handleAddStep}
            className="flex items-center gap-2 w-full justify-center rounded-xl border border-dashed border-border py-2.5 text-xs text-text-muted hover:border-accent/50 hover:text-accent transition-colors"
          >
            <Plus size={13} />
            Ajouter une étape
          </button>
        </div>

        {/* Phase GO */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: '#f43f5e' }}>GO !</span>
            <span className="text-xs text-text-muted flex-1">Durée de l'écran GO avant l'apnée</span>
          </div>
          <DurationStepper
            value={goDurationS}
            onChange={setGoDurationS}
            step={0.5}
            min={0.5}
            max={30}
          />
        </div>

        {/* Flèche séparateur */}
        <div className="flex justify-center">
          <ArrowDown size={16} className="text-white/20" />
        </div>

        {/* Phase Récupération */}
        <div className="card p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">Récupération post-apnée</p>
            <p className="text-xs text-text-muted mt-0.5">
              Guidage respiratoire déclenché automatiquement quand tu arrêtes le chrono
            </p>
          </div>

          {/* Pattern */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60">Pattern</label>
            <select
              value={recoveryPattern}
              onChange={(e) => setRecoveryPattern(e.target.value as WarmupBreathPattern)}
              className="w-full rounded-xl bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary outline-none focus:border-accent transition-colors"
            >
              {PATTERN_OPTIONS.map((p) => (
                <option key={p} value={p} className="bg-bg-elevated">
                  {PATTERN_CATALOGUE[p].label}
                </option>
              ))}
            </select>
          </div>

          {/* Durée */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60">Durée</label>
            <DurationStepper
              value={recoveryDurationS}
              onChange={setRecoveryDurationS}
              step={5}
              min={5}
              max={600}
            />
          </div>

          {/* Instruction */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60">Instruction affichée</label>
            <input
              type="text"
              value={recoveryInstruction}
              onChange={(e) => setRecoveryInstruction(e.target.value)}
              placeholder="Ex: Récupération calme post-apnée"
              className="w-full rounded-xl bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary placeholder:text-white/30 outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={() => void handleSave()}
          disabled={!name.trim() || steps.length === 0 || isSaving}
          className="flex items-center gap-2 w-full justify-center rounded-2xl bg-accent py-4 text-base font-semibold text-text-inverse hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save size={18} />
          {isSaving ? 'Enregistrement…' : "Enregistrer l'échauffement"}
        </button>

      </div>
    </div>
  )
}
