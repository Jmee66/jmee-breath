import { db } from '@core/db'
import { syncManager } from '@core/sync'
import { useAuthStore } from '@modules/auth/store/authStore'
import type { Exercise } from '@core/types'
import { PRESET_EXERCISES } from '../presets'

/**
 * Initialise la DB avec les presets.
 * - Upsert les presets actuels (ids stables)
 * - Supprime les anciens presets dont l'id n'est plus dans la liste
 */
export async function seedPresets(): Promise<void> {
  const validIds = new Set(PRESET_EXERCISES.map((e) => e.id))
  const existing = await db.exercises.filter((e) => !!e.isPreset).toArray()
  const obsolete = existing.filter((e) => !validIds.has(e.id)).map((e) => e.id)
  if (obsolete.length > 0) await db.exercises.bulkDelete(obsolete)
  await db.exercises.bulkPut(PRESET_EXERCISES)
}

export async function getAllExercises(): Promise<Exercise[]> {
  return db.exercises.toArray()
}

export async function getExerciseById(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id)
}

/** Convertit un Exercise (camelCase) en payload snake_case pour Supabase. */
function toSupabasePayload(exercise: Exercise, userId: string): Record<string, unknown> {
  return {
    id:                         exercise.id,
    user_id:                    userId,
    name:                       exercise.name,
    description:                exercise.description,
    category:                   exercise.category,
    difficulty:                 exercise.difficulty,
    tags:                       exercise.tags,
    phases:                     exercise.phases,
    repetitions:                exercise.repetitions,
    rest_between_reps_seconds:  exercise.restBetweenRepsSeconds,
    is_preset:                  false,
    custom_presets:             exercise.customPresets ?? [],
    created_at:                 exercise.createdAt,
    updated_at:                 exercise.updatedAt,
  }
}

export async function saveExercise(exercise: Exercise): Promise<void> {
  await db.exercises.put(exercise)
  if (!exercise.isPreset) {
    const userId = useAuthStore.getState().user?.id
    if (userId) {
      await syncManager.enqueue({
        table:     'exercises',
        operation: 'upsert',
        recordId:  exercise.id,
        payload:   toSupabasePayload(exercise, userId),
        createdAt: new Date().toISOString(),
      })
    }
  }
}

export async function deleteExercise(id: string): Promise<void> {
  const exercise = await db.exercises.get(id)
  if (!exercise || exercise.isPreset) return

  await db.exercises.delete(id)
  const userId = useAuthStore.getState().user?.id
  if (userId) {
    await syncManager.enqueue({
      table:     'exercises',
      operation: 'delete',
      recordId:  id,
      payload:   null,
      createdAt: new Date().toISOString(),
    })
  }
}
