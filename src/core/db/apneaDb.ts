import Dexie, { type EntityTable } from 'dexie'
import type { Exercise } from '../types/exercise.types'
import type { Session, FreeTimerSession } from '../types/session.types'
import type { UserSettings } from '../types/user.types'
import type { CustomWarmup } from '@modules/free-timer/types'
import type { ApneaTable } from '@modules/apnea-tables/types'

export interface SyncQueueEntry {
  id?: number
  /** Tables Supabase concernées par la sync — étendre ici quand on ajoute une table. */
  table: 'exercises' | 'sessions' | 'free_timer_sessions' | 'user_preferences' | 'custom_warmups' | 'apnea_tables'
  operation: 'upsert' | 'delete'
  recordId: string
  payload: unknown
  status: 'pending' | 'in-flight' | 'failed'
  retryCount: number
  createdAt: string
  error?: string
}

export interface LocalSettings {
  /** Toujours 'local' — une seule ligne */
  id: 'local'
  settings: UserSettings
  updatedAt: string
}

export interface OnboardingState {
  id: 'local'
  isCompleted: boolean
  completedAt?: string
  level?: string
}

export class ApneaDatabase extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  sessions!: EntityTable<Session, 'id'>
  freeTimerSessions!: EntityTable<FreeTimerSession, 'id'>
  customWarmups!: EntityTable<CustomWarmup, 'id'>
  apneaTables!: EntityTable<ApneaTable, 'id'>
  settings!: EntityTable<LocalSettings, 'id'>
  onboarding!: EntityTable<OnboardingState, 'id'>
  syncQueue!: EntityTable<SyncQueueEntry, 'id'>

  constructor() {
    super('ApneaDB')

    this.version(1).stores({
      exercises: 'id, category, difficulty, isPreset, updatedAt',
      sessions: 'id, exerciseId, startedAt, completedAt, syncedAt',
      freeTimerSessions: 'id, startedAt, syncedAt',
      settings: 'id',
      onboarding: 'id',
      syncQueue: '++id, table, operation, status, createdAt, [status+createdAt]',
    })

    this.version(2).stores({
      customWarmups: 'id, createdAt, syncedAt',
    })

    this.version(3).stores({
      apneaTables: 'id, type, createdAt, syncedAt',
    })
  }
}

export const db = new ApneaDatabase()
