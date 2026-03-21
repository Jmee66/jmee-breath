import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Exercise, ExerciseCategory } from '@core/types'
import { useSettingsStore } from '@modules/settings'
import { ExerciseCard } from './card/ExerciseCard'

// ── Filter types ────────────────────────────────────────────────────────────

type CategoryFilter = ExerciseCategory | 'all'

const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: 'all',           label: 'Tous' },
  { value: 'breathing',     label: 'Respiration' },
  { value: 'apnea',         label: 'Apnée' },
  { value: 'visualization', label: 'Visualisation' },
  { value: 'preparation',   label: 'Préparation' },
  { value: 'meditation',    label: 'Méditation' },
  { value: 'panic',         label: 'Panique' },
  { value: 'custom',        label: 'Perso' },
]

interface ExerciseListProps {
  exercises: Exercise[]
  onEdit?: (exercise: Exercise) => void
  onDelete?: (id: string) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function ExerciseList({ exercises, onEdit, onDelete }: ExerciseListProps) {
  const navigate = useNavigate()
  const { settings, update: updateSettings } = useSettingsStore()
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [difficultyMax, setDifficultyMax] = useState<number>(5)

  // Collect all unique tags across exercises
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    exercises.forEach((ex) => ex.tags.forEach((t) => tags.add(t)))
    return Array.from(tags).sort()
  }, [exercises])

  // Filter
  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (activeCategory !== 'all' && ex.category !== activeCategory) return false
      if (ex.difficulty > difficultyMax) return false
      if (activeTags.size > 0 && !ex.tags.some((t) => activeTags.has(t))) return false
      return true
    })
  }, [exercises, activeCategory, activeTags, difficultyMax])

  const presets  = filtered.filter((ex) => ex.isPreset)
  const custom   = filtered.filter((ex) => !ex.isPreset)

  const favorites = settings.favoriteExerciseIds

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  function handleToggleFavorite(id: string) {
    const current = settings.favoriteExerciseIds
    const updated = current.includes(id)
      ? current.filter((fid) => fid !== id)
      : [...current, id]
    void updateSettings({ favoriteExerciseIds: updated })
  }

  function handleStart(exercise: Exercise) {
    navigate('/session', { state: { exercise } })
  }

  return (
    <div className="space-y-4">
      {/* ── Category tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveCategory(tab.value)}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === tab.value
                ? 'bg-accent text-text-inverse'
                : 'bg-bg-elevated text-text-secondary hover:bg-bg-overlay'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Difficulty filter ── */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted flex-shrink-0">Difficulté ≤</span>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              onClick={() => setDifficultyMax(d === difficultyMax && d !== 5 ? 5 : d)}
              className={`h-6 w-6 rounded-full text-xs font-semibold transition-colors ${
                d <= difficultyMax
                  ? 'bg-accent/20 text-accent'
                  : 'bg-bg-elevated text-text-muted'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tag chips ── */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                activeTags.has(tag)
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-border text-text-muted hover:border-border'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-text-secondary">Aucun exercice ne correspond aux filtres.</p>
        </div>
      )}

      {/* ── All exercises (presets first, then custom) ── */}
      {filtered.length > 0 && (
        <section className="space-y-3">
          {[...presets, ...custom].map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              isFavorite={favorites.includes(ex.id)}
              onToggleFavorite={handleToggleFavorite}
              onStart={handleStart}
              onEdit={!ex.isPreset ? onEdit : undefined}
              onDelete={!ex.isPreset ? onDelete : undefined}
            />
          ))}
        </section>
      )}
    </div>
  )
}
