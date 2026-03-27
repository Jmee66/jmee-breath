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
  toggleTableFavorite: (tableId: string) => Promise<void>
  moveTableFavorite: (tableId: string, direction: 'up' | 'down') => Promise<void>
  toggleWarmupFavorite: (warmupId: string) => Promise<void>
  moveWarmupFavorite: (warmupId: string, direction: 'up' | 'down') => Promise<void>
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
  toggleTableFavorite: async (tableId) => {
    const current = get().settings
    const ids = current.favoriteTableIds ?? []
    const updated = ids.includes(tableId)
      ? ids.filter((id) => id !== tableId)
      : [...ids, tableId]
    await get().update({ favoriteTableIds: updated })
  },
  moveTableFavorite: async (tableId, direction) => {
    const ids = [...(get().settings.favoriteTableIds ?? [])]
    const idx = ids.indexOf(tableId)
    if (idx === -1) return
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    await get().update({ favoriteTableIds: ids })
  },
  toggleWarmupFavorite: async (warmupId) => {
    const current = get().settings
    const ids = current.favoriteWarmupIds ?? []
    const updated = ids.includes(warmupId)
      ? ids.filter((id) => id !== warmupId)
      : [...ids, warmupId]
    await get().update({ favoriteWarmupIds: updated })
  },
  moveWarmupFavorite: async (warmupId, direction) => {
    const ids = [...(get().settings.favoriteWarmupIds ?? [])]
    const idx = ids.indexOf(warmupId)
    if (idx === -1) return
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    await get().update({ favoriteWarmupIds: ids })
  },
}))
