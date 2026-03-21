export type PhaseType = 'inhale' | 'hold' | 'exhale' | 'recovery'

export type ExerciseCategory =
  | 'breathing'       // Respiration (box breathing, cohérence cardiaque…)
  | 'apnea'           // Apnée (tables CO₂, O₂, retention…)
  | 'visualization'   // Visualisation & Hypnose
  | 'preparation'     // Préparation & Récupération
  | 'meditation'      // Méditation
  | 'panic'           // Gestion de la panique
  | 'custom'          // Personnalisé

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5

export interface Phase {
  type: PhaseType
  durationSeconds: number
  /** Texte affiché pendant cette phase (ex: "Relâche tout") */
  label?: string
}

/** Preset nommé, sauvegardé dans la fiche d'un exercice */
export interface ExercisePreset {
  id: string
  name: string
  phases: Phase[]
  repetitions: number
}

export interface Exercise {
  id: string
  name: string
  description: string
  category: ExerciseCategory
  difficulty: DifficultyLevel
  tags: string[]
  /** Séquence de phases pour UNE répétition */
  phases: Phase[]
  repetitions: number
  /** Durée du repos entre chaque répétition en secondes */
  restBetweenRepsSeconds: number
  /** Exercices preset = bundlés, jamais synchronisés vers Supabase */
  isPreset: boolean
  createdAt: string
  updatedAt: string
  /** Presets nommés créés par l'utilisateur dans la fiche */
  customPresets?: ExercisePreset[]
}

/** Durée totale d'un exercice en secondes */
export function calcExerciseDuration(exercise: Exercise): number {
  const repDuration = exercise.phases.reduce(
    (sum, p) => sum + p.durationSeconds,
    0,
  )
  return (
    repDuration * exercise.repetitions +
    exercise.restBetweenRepsSeconds * Math.max(0, exercise.repetitions - 1)
  )
}
