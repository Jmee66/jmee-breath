import { create } from 'zustand'
import type { Exercise } from '@core/types'

interface ExerciseState {
  exercises: Exercise[]
  selectedExercise: Exercise | null
  isLoading: boolean
  setExercises: (exercises: Exercise[]) => void
  selectExercise: (exercise: Exercise | null) => void
  setLoading: (loading: boolean) => void
}

export const useExerciseStore = create<ExerciseState>((set) => ({
  exercises: [],
  selectedExercise: null,
  isLoading: false,
  setExercises: (exercises) => set({ exercises }),
  selectExercise: (selectedExercise) => set({ selectedExercise }),
  setLoading: (isLoading) => set({ isLoading }),
}))
