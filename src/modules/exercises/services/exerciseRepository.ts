import { db } from '@core/db'
import { syncManager } from '@core/sync'
import type { Exercise } from '@core/types'
import { PRESET_EXERCISES } from '../presets'

/**
 * Initialise la DB avec les presets.
 * - Upsert les presets actuels (ids stables)
 * - Supprime les anciens presets dont l'id n'est plus dans la liste
 *   (ex : variantes box 4x4/5x5/6x6 supprimées au profit d'un seul preset)
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

export async function saveExercise(exercise: Exercise): Promise<void> {
  await db.exercises.put(exercise)
  if (!exercise.isPreset) {
    await syncManager.enqueue({
      table: 'exercises',
      operation: 'upsert',
      recordId: exercise.id,
      payload: exercise,
      createdAt: new Date().toISOString(),
    })
  }
}

export async function deleteExercise(id: string): Promise<void> {
  const exercise = await db.exercises.get(id)
  if (!exercise || exercise.isPreset) return

  await db.exercises.delete(id)
  await syncManager.enqueue({
    table: 'exercises',
    operation: 'delete',
    recordId: id,
    payload: null,
    createdAt: new Date().toISOString(),
  })
}
