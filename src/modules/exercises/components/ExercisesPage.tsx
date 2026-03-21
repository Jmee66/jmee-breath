import { useEffect, useState, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { useExerciseStore } from '../store/exerciseStore'
import { useSettingsStore } from '@modules/settings'
import { getAllExercises, saveExercise, deleteExercise, seedPresets } from '../services/exerciseRepository'
import type { Exercise } from '@core/types'
import { ExerciseList } from './ExerciseList'
import { ExerciseEditor } from './ExerciseEditor'

// ── Component ────────────────────────────────────────────────────────────────

export function ExercisesPage() {
  const { exercises, isLoading, setExercises, setLoading } = useExerciseStore()
  const { settings, update: updateSettings } = useSettingsStore()
  const [showEditor, setShowEditor] = useState(false)
  const [editingExercise, setEditingExercise] = useState<Exercise | undefined>()

  const hiddenPresetIds = settings.hiddenPresetIds ?? []

  // Filter out hidden presets
  const visibleExercises = useMemo(
    () => exercises.filter((ex) => !ex.isPreset || !hiddenPresetIds.includes(ex.id)),
    [exercises, hiddenPresetIds],
  )

  // Load exercises from IndexedDB on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      await seedPresets()
      const all = await getAllExercises()
      if (!cancelled) {
        setExercises(all)
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [setExercises, setLoading])

  async function handleSave(data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    // Editing a preset → creates a custom copy with a new id
    const isEditingPreset = editingExercise?.isPreset ?? false
    const exercise: Exercise = {
      ...data,
      isPreset: false,
      id: (!isEditingPreset && editingExercise?.id) ? editingExercise.id : `custom-${crypto.randomUUID()}`,
      createdAt: (!isEditingPreset && editingExercise?.createdAt) ? editingExercise.createdAt : now,
      updatedAt: now,
    }
    await saveExercise(exercise)
    const all = await getAllExercises()
    setExercises(all)
    setShowEditor(false)
    setEditingExercise(undefined)
  }

  function handleEdit(exercise: Exercise) {
    setEditingExercise(exercise)
    setShowEditor(true)
  }

  async function handleDelete(id: string) {
    const exercise = exercises.find((ex) => ex.id === id)
    if (!exercise) return
    if (exercise.isPreset) {
      // Hide the preset instead of deleting (seedPresets would re-add it)
      await updateSettings({ hiddenPresetIds: [...hiddenPresetIds, id] })
    } else {
      await deleteExercise(id)
      const all = await getAllExercises()
      setExercises(all)
    }
  }

  function handleCloseEditor() {
    setShowEditor(false)
    setEditingExercise(undefined)
  }

  // Editor overlay
  if (showEditor) {
    return (
      <div className="space-y-4 animate-slide-up">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            {editingExercise ? 'Modifier l\'exercice' : 'Nouvel exercice'}
          </h2>
          <button
            onClick={handleCloseEditor}
            className="p-1.5 rounded-lg text-text-muted hover:bg-bg-elevated transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <ExerciseEditor
          initialExercise={editingExercise}
          onSave={handleSave}
          onCancel={handleCloseEditor}
        />
      </div>
    )
  }

  return (
    <PageContainer
      title="Exercices"
      subtitle="Bibliothèque et exercices personnalisés"
      actions={
        <button
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-text-inverse hover:opacity-90 transition-opacity"
        >
          <Plus size={15} />
          Créer
        </button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-36 animate-pulse-soft" />
          ))}
        </div>
      ) : (
        <ExerciseList
          exercises={visibleExercises}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </PageContainer>
  )
}
