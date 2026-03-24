import { useState, useRef } from 'react'
import { Plus, Minus, Save, X, GripVertical, Ratio } from 'lucide-react'
import type { Exercise, Phase, PhaseType, ExerciseCategory, DifficultyLevel } from '@core/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

const PHASE_OPTIONS: { value: PhaseType; label: string; color: string }[] = [
  { value: 'inhale',   label: 'Inspiration', color: 'text-phase-inhale' },
  { value: 'hold',     label: 'Rétention',   color: 'text-phase-hold' },
  { value: 'exhale',   label: 'Expiration',  color: 'text-phase-exhale' },
  { value: 'recovery', label: 'Récupération',color: 'text-phase-recovery' },
]

const CATEGORY_OPTIONS: { value: ExerciseCategory; label: string }[] = [
  { value: 'breathing',     label: 'Respiration' },
  { value: 'apnea',         label: 'Apnée' },
  { value: 'visualization', label: 'Visualisation & Hypnose' },
  { value: 'preparation',   label: 'Préparation & Récupération' },
  { value: 'meditation',    label: 'Méditation' },
  { value: 'panic',         label: 'Gestion de la panique' },
  { value: 'custom',        label: 'Personnalisé' },
]

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

function snapToHalf(val: number): number {
  return Math.round(val * 2) / 2
}

function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `${m} min` : `${m} min ${r} s`
}

// ── Champ de durée éditable ───────────────────────────────────────────────────

function DurationInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1)
  const [raw, setRaw] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (str: string) => {
    const parsed = parseFloat(str.replace(',', '.'))
    if (!isNaN(parsed)) {
      onChange(clamp(snapToHalf(parsed), 0.5, 300))
    }
    setRaw(null)
  }

  return (
    <div className="flex items-baseline justify-center gap-px w-12">
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        min={0.5}
        max={300}
        step={0.5}
        value={raw ?? display}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={(e) => { setRaw(display); e.target.select() }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-8 text-center text-xs font-mono text-text-primary bg-transparent outline-none border-none
          [appearance:textfield]
          [&::-webkit-inner-spin-button]:appearance-none
          [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-xs font-mono text-white/85">s</span>
    </div>
  )
}

// ── Phase row ────────────────────────────────────────────────────────────────

interface PhaseRowProps {
  phase: Phase
  index: number
  onChange: (index: number, phase: Phase) => void
  onRemove: (index: number) => void
  canRemove: boolean
  /** Durée verrouillée (calculée par ratio) — seul le type est éditable */
  locked?: boolean
}

function PhaseRow({ phase, index, onChange, onRemove, canRemove, locked }: PhaseRowProps) {
  const colorClass = PHASE_OPTIONS.find((p) => p.value === phase.type)?.color ?? ''

  return (
    <div className={`flex items-center gap-2 rounded-xl p-3 ${locked ? 'bg-bg-overlay/60' : 'bg-bg-elevated'}`}>
      {/* Drag handle placeholder */}
      <GripVertical size={14} className="text-white/85 flex-shrink-0" />

      {/* Phase type select */}
      <select
        value={phase.type}
        onChange={(e) => onChange(index, { ...phase, type: e.target.value as PhaseType })}
        className={`flex-1 min-w-0 bg-transparent text-xs font-medium border-none outline-none ${colorClass}`}
      >
        {PHASE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-bg-elevated text-text-primary">
            {opt.label}
          </option>
        ))}
      </select>

      {/* Duration stepper */}
      <div className="flex items-center gap-1.5">
        {!locked && (
          <button
            onClick={() => onChange(index, { ...phase, durationSeconds: clamp(phase.durationSeconds - 0.5, 0.5, 300) })}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-overlay text-white/85 hover:bg-bg-overlay/80 active:scale-95 transition-transform"
          >
            <Minus size={13} />
          </button>
        )}

        {locked ? (
          <div className="w-12 flex items-baseline justify-center gap-px">
            <span className="text-xs font-mono text-white/50">{phase.durationSeconds % 1 === 0 ? phase.durationSeconds : phase.durationSeconds.toFixed(1)}</span>
            <span className="text-xs font-mono text-white/30">s</span>
          </div>
        ) : (
          <DurationInput
            value={phase.durationSeconds}
            onChange={(v) => onChange(index, { ...phase, durationSeconds: v })}
          />
        )}

        {!locked && (
          <button
            onClick={() => onChange(index, { ...phase, durationSeconds: clamp(phase.durationSeconds + 0.5, 0.5, 300) })}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-overlay text-white/85 hover:bg-bg-overlay/80 active:scale-95 transition-transform"
          >
            <Plus size={13} />
          </button>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        className="flex-shrink-0 p-1 rounded-md text-white/85 disabled:opacity-30 hover:text-status-error transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ExerciseEditorProps {
  /** Existing exercise to edit — undefined = new */
  initialExercise?: Partial<Exercise>
  onSave: (exercise: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onCancel: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExerciseEditor({ initialExercise, onSave, onCancel }: ExerciseEditorProps) {
  const [name, setName] = useState(initialExercise?.name ?? '')
  const [description, setDescription] = useState(initialExercise?.description ?? '')
  const [category, setCategory] = useState<ExerciseCategory>(initialExercise?.category ?? 'breathing')
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialExercise?.difficulty ?? 1)
  const [repetitions, setRepetitions] = useState(initialExercise?.repetitions ?? 4)
  const [restSeconds, setRestSeconds] = useState(initialExercise?.restBetweenRepsSeconds ?? 0)
  const [phases, setPhases] = useState<Phase[]>(
    initialExercise?.phases ?? [
      { type: 'inhale',   durationSeconds: 4 },
      { type: 'hold',     durationSeconds: 4 },
      { type: 'exhale',   durationSeconds: 4 },
      { type: 'recovery', durationSeconds: 4 },
    ]
  )
  const [tagsInput, setTagsInput] = useState((initialExercise?.tags ?? []).join(', '))
  const [isSaving, setIsSaving] = useState(false)

  // ── Mode ratio ──────────────────────────────────────────────────────────────
  const [ratioMode, setRatioMode] = useState(false)
  const [ratioValues, setRatioValues] = useState<number[]>([1, 1, 1, 1])

  /** Calcule les durées des phases n≥1 à partir de la durée de la phase 0 et des ratios. */
  function applyRatio(ratios: number[], currentPhases: Phase[]): Phase[] {
    const ref = currentPhases[0]?.durationSeconds ?? 4
    const base = ratios[0] || 1
    return currentPhases.map((phase, i) =>
      i === 0
        ? phase
        : { ...phase, durationSeconds: snapToHalf(clamp(ref * (ratios[i] ?? 1) / base, 0.5, 300)) }
    )
  }

  function handleRatioChange(index: number, raw: string) {
    const val = Math.max(0.5, parseFloat(raw.replace(',', '.')) || 1)
    const newRatios = ratioValues.map((r, i) => i === index ? val : r)
    setRatioValues(newRatios)
    setPhases((prev) => applyRatio(newRatios, prev))
  }

  function toggleRatioMode() {
    if (!ratioMode) {
      const newRatios = phases.map(() => 1)
      setRatioValues(newRatios)
      // pas de recalcul — les durées actuelles restent jusqu'au 1er changement
    }
    setRatioMode((v) => !v)
  }

  // ── Handlers phases ─────────────────────────────────────────────────────────

  function handlePhaseChange(index: number, updated: Phase) {
    setPhases((prev) => {
      const next = prev.map((p, i) => (i === index ? updated : p))
      // en mode ratio, si la phase de référence (0) change de durée → recalcul
      if (ratioMode && index === 0) return applyRatio(ratioValues, next)
      // en mode ratio, phases verrouillées (>0) : on laisse quand même le type changer
      return next
    })
  }

  function handleRemovePhase(index: number) {
    const newPhases = phases.filter((_, i) => i !== index)
    const newRatios = ratioValues.filter((_, i) => i !== index)
    if (ratioMode) {
      setRatioValues(newRatios)
      setPhases(applyRatio(newRatios, newPhases))
    } else {
      setPhases(newPhases)
    }
  }

  function handleAddPhase() {
    const newPhases = [...phases, { type: 'exhale' as PhaseType, durationSeconds: 4 }]
    const newRatios = [...ratioValues, 1]
    if (ratioMode) {
      setRatioValues(newRatios)
      setPhases(applyRatio(newRatios, newPhases))
    } else {
      setPhases(newPhases)
    }
  }

  async function handleSave() {
    if (!name.trim()) return
    setIsSaving(true)
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      await onSave({
        name: name.trim(),
        description: description.trim(),
        category,
        difficulty,
        tags,
        phases,
        repetitions,
        restBetweenRepsSeconds: restSeconds,
        isPreset: false,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Nom ── */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/85">Nom de l'exercice</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Box Breathing personnel"
          className="w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-white/40 border border-border focus:border-accent focus:outline-none transition-colors"
        />
      </div>

      {/* ── Description ── */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/85">Description (optionnel)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Décrivez l'exercice..."
          className="w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-white/40 border border-border focus:border-accent focus:outline-none transition-colors resize-none"
        />
      </div>

      {/* ── Catégorie + Difficulté ── */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-white/85">Catégorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
            className="w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-text-primary border border-border focus:border-accent focus:outline-none transition-colors"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/85">Difficulté</label>
          <div className="flex gap-1 pt-1">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d as DifficultyLevel)}
                className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                  d <= difficulty ? 'bg-accent text-text-inverse' : 'bg-bg-elevated text-white/85'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Phases ── */}
      <div className="space-y-2">

        {/* Header : label + toggle ratio */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-white/85">Phases respiratoires</label>
          <button
            onClick={toggleRatioMode}
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
              ratioMode
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'text-white/50 hover:text-white/85 border border-transparent'
            }`}
          >
            <Ratio size={11} />
            Mode ratio
          </button>
        </div>

        {/* Carte ratio — visible seulement en mode ratio */}
        {ratioMode && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">

            {/* Grille ratio : une colonne par phase */}
            <div className="flex items-end gap-1">
              {ratioValues.map((r, i) => {
                const phaseLabel = PHASE_OPTIONS.find((p) => p.value === phases[i]?.type)?.label ?? `Phase ${i + 1}`
                const phaseColor = PHASE_OPTIONS.find((p) => p.value === phases[i]?.type)?.color ?? 'text-white/85'
                return (
                  <div key={i} className="flex items-end gap-1 flex-1 min-w-0">
                    {/* Colonne : label + input */}
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <span className={`text-[10px] font-semibold tracking-wide truncate w-full text-center ${phaseColor}`}>
                        {phaseLabel}
                      </span>
                      <input
                        type="number"
                        min={0.5}
                        step={1}
                        value={r}
                        onChange={(e) => handleRatioChange(i, e.target.value)}
                        className="w-full rounded-xl border border-accent/40 bg-bg-overlay py-2.5 text-center text-base font-bold text-accent outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors
                          [appearance:textfield]
                          [&::-webkit-inner-spin-button]:appearance-none
                          [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                    {/* Séparateur ":" entre colonnes */}
                    {i < ratioValues.length - 1 && (
                      <span className="text-white/25 text-lg font-light pb-2.5 flex-shrink-0">:</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Ligne d'info */}
            <p className="text-xs text-white/40 text-center">
              Éditez la <span className="text-white/70 font-medium">1ʳᵉ phase</span> ci-dessous — les autres se calculent automatiquement
            </p>
          </div>
        )}

        {/* Liste des phases */}
        <div className="space-y-2">
          {phases.map((phase, idx) => (
            <PhaseRow
              key={idx}
              phase={phase}
              index={idx}
              onChange={handlePhaseChange}
              onRemove={handleRemovePhase}
              canRemove={phases.length > 1}
              locked={ratioMode && idx > 0}
            />
          ))}
        </div>

        <button
          onClick={handleAddPhase}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs text-white/85 hover:border-accent hover:text-accent transition-colors"
        >
          <Plus size={12} />
          Ajouter une phase
        </button>
      </div>

      {/* ── Répétitions + Repos ── */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-white/85">Répétitions</label>
          <div className="flex items-center gap-2 rounded-xl bg-bg-elevated px-3 py-2.5 border border-border">
            <button onClick={() => setRepetitions((r) => clamp(r - 1, 1, 99))} className="p-2 text-white/85 hover:text-accent active:scale-95 transition-transform">
              <Minus size={14} />
            </button>
            <span className="flex-1 text-center text-sm font-mono text-text-primary">{repetitions}</span>
            <button onClick={() => setRepetitions((r) => clamp(r + 1, 1, 99))} className="p-2 text-white/85 hover:text-accent active:scale-95 transition-transform">
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-white/85">Repos entre reps</label>
          <div className="flex items-center gap-2 rounded-xl bg-bg-elevated px-3 py-2.5 border border-border">
            <button onClick={() => setRestSeconds((r) => clamp(r - 5, 0, 300))} className="p-2 text-white/85 hover:text-accent active:scale-95 transition-transform">
              <Minus size={14} />
            </button>
            <span className="flex-1 text-center text-sm font-mono text-text-primary">{restSeconds}s</span>
            <button onClick={() => setRestSeconds((r) => clamp(r + 5, 0, 300))} className="p-2 text-white/85 hover:text-accent active:scale-95 transition-transform">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Durée totale ── */}
      {(() => {
        const perRep   = phases.reduce((s, p) => s + p.durationSeconds, 0)
        const total    = perRep * repetitions + restSeconds * Math.max(0, repetitions - 1)
        const perRepFmt = formatDuration(perRep)
        const totalFmt  = formatDuration(total)
        return (
          <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-4 py-3 border border-border">
            <span className="text-xs text-white/85">Durée totale estimée</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-white/85">{repetitions} × {perRepFmt}</span>
              <span className="text-sm font-semibold text-text-primary">{totalFmt}</span>
            </div>
          </div>
        )
      })()}

      {/* ── Tags ── */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/85">Tags (séparés par des virgules)</label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="ex: relaxation, avancé, co2"
          className="w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-white/40 border border-border focus:border-accent focus:outline-none transition-colors"
        />
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-white/85 hover:bg-bg-elevated transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || isSaving}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-text-inverse disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          <Save size={14} />
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
