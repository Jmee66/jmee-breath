import { create } from 'zustand'
import { db } from '@core/db'
import { defaultUserSettings, type UserSettings } from '@core/types'

interface SettingsState {
  settings: UserSettings
  isLoading: boolean
  load: () => Promise<void>
  update: (patch: Partial<UserSettings>) => Promise<void>
  toggleFavorite: (exerciseId: string) => Promise<void>
  moveFavorite: (exerciseId: string, direction: 'up' | 'down') => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultUserSettings(),
  isLoading: true,
  load: async () => {
    const record = await db.settings.get('local')
    set({
      settings: record?.settings ?? defaultUserSettings(),
      isLoading: false,
    })
  },
  update: async (patch) => {
    const current = get().settings
    const updated = { ...current, ...patch }
    set({ settings: updated })
    await db.settings.put({
      id: 'local',
      settings: updated,
      updatedAt: new Date().toISOString(),
    })
  },
  toggleFavorite: async (exerciseId) => {
    const current = get().settings
    const ids = current.favoriteExerciseIds
    const updated = ids.includes(exerciseId)
      ? ids.filter((id) => id !== exerciseId)
      : [...ids, exerciseId]
    await get().update({ favoriteExerciseIds: updated })
  },
  moveFavorite: async (exerciseId, direction) => {
    const ids = [...get().settings.favoriteExerciseIds]
    const idx = ids.indexOf(exerciseId)
    if (idx === -1) return
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    await get().update({ favoriteExerciseIds: ids })
  },
}))
