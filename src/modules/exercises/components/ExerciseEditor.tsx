import { useState } from 'react'
import { Plus, Minus, Save, X, GripVertical } from 'lucide-react'
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

// ── Phase row ────────────────────────────────────────────────────────────────

interface PhaseRowProps {
  phase: Phase
  index: number
  onChange: (index: number, phase: Phase) => void
  onRemove: (index: number) => void
  canRemove: boolean
}

function PhaseRow({ phase, index, onChange, onRemove, canRemove }: PhaseRowProps) {
  const colorClass = PHASE_OPTIONS.find((p) => p.value === phase.type)?.color ?? ''

  return (
    <div className="flex items-center gap-2 rounded-xl bg-bg-elevated p-3">
      {/* Drag handle placeholder */}
      <GripVertical size={14} className="text-text-muted flex-shrink-0" />

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
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(index, { ...phase, durationSeconds: clamp(phase.durationSeconds - 1, 1, 300) })}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-bg-overlay text-text-secondary hover:bg-bg-overlay/80 active:scale-95 transition-transform"
        >
          <Minus size={10} />
        </button>

        <span className="w-10 text-center text-xs font-mono text-text-primary">
          {phase.durationSeconds}s
        </span>

        <button
          onClick={() => onChange(index, { ...phase, durationSeconds: clamp(phase.durationSeconds + 1, 1, 300) })}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-bg-overlay text-text-secondary hover:bg-bg-overlay/80 active:scale-95 transition-transform"
        >
          <Plus size={10} />
        </button>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        className="flex-shrink-0 p-1 rounded-md text-text-muted disabled:opacity-30 hover:text-status-error transition-colors"
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

  function handlePhaseChange(index: number, updated: Phase) {
    setPhases((prev) => prev.map((p, i) => (i === index ? updated : p)))
  }

  function handleRemovePhase(index: number) {
    setPhases((prev) => prev.filter((_, i) => i !== index))
  }

  function handleAddPhase() {
    setPhases((prev) => [...prev, { type: 'exhale', durationSeconds: 4 }])
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
        <label className="text-xs font-medium text-text-secondary">Nom de l'exercice</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Box Breathing personnel"
          className="w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted border border-border focus:border-accent focus:outline-none transition-colors"
        />
      </div>

      {/* ── Description ── */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Description (optionnel)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Décrivez l'exercice..."
          className="w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted border border-border focus:border-accent focus:outline-none transition-colors resize-none"
        />
      </div>

      {/* ── Catégorie + Difficulté ── */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Catégorie</label>
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
          <label className="text-xs font-medium text-text-secondary">Difficulté</label>
          <div className="flex gap-1 pt-1">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d as DifficultyLevel)}
                className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                  d <= difficulty ? 'bg-accent text-text-inverse' : 'bg-bg-elevated text-text-muted'
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
        <label className="text-xs font-medium text-text-secondary">Phases respiratoires</label>
        <div className="space-y-2">
          {phases.map((phase, idx) => (
            <PhaseRow
              key={idx}
              phase={phase}
              index={idx}
              onChange={handlePhaseChange}
              onRemove={handleRemovePhase}
              canRemove={phases.length > 1}
            />
          ))}
        </div>
        <button
          onClick={handleAddPhase}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors"
        >
          <Plus size={12} />
          Ajouter une phase
        </button>
      </div>

      {/* ── Répétitions + Repos ── */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Répétitions</label>
          <div className="flex items-center gap-2 rounded-xl bg-bg-elevated px-3 py-2.5 border border-border">
            <button onClick={() => setRepetitions((r) => clamp(r - 1, 1, 99))} className="text-text-secondary hover:text-accent">
              <Minus size={13} />
            </button>
            <span className="flex-1 text-center text-sm font-mono text-text-primary">{repetitions}</span>
            <button onClick={() => setRepetitions((r) => clamp(r + 1, 1, 99))} className="text-text-secondary hover:text-accent">
              <Plus size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Repos entre reps</label>
          <div className="flex items-center gap-2 rounded-xl bg-bg-elevated px-3 py-2.5 border border-border">
            <button onClick={() => setRestSeconds((r) => clamp(r - 5, 0, 300))} className="text-text-secondary hover:text-accent">
              <Minus size={13} />
            </button>
            <span className="flex-1 text-center text-sm font-mono text-text-primary">{restSeconds}s</span>
            <button onClick={() => setRestSeconds((r) => clamp(r + 5, 0, 300))} className="text-text-secondary hover:text-accent">
              <Plus size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tags ── */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Tags (séparés par des virgules)</label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="ex: relaxation, avancé, co2"
          className="w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted border border-border focus:border-accent focus:outline-none transition-colors"
        />
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-text-secondary hover:bg-bg-elevated transition-colors"
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
