export type UserLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'

export interface AudioSettings {
  masterVolume: number
  breathSoundsEnabled: boolean
  breathSoundsVolume: number
  /** 'synth' = Web Audio API synthèse | 'samples' = fichiers .wav */
  breathSoundsMode: 'synth' | 'samples'
}

export interface VoiceSettings {
  enabled: boolean
  engine: 'web-speech' | 'elevenlabs'
  voiceURI: string
  rate: number
  volume: number
  elevenLabsVoiceId?: string
}

export interface NotificationSettings {
  enabled: boolean
  reminderEnabled: boolean
  reminderHour: number
  reminderMinute: number
  reminderDays: number[]
}

export interface UserSettings {
  theme: 'dark' | 'system'
  language: string
  audio: AudioSettings
  voice: VoiceSettings
  notifications: NotificationSettings
  favoriteExerciseIds: string[]
  favoriteTableIds: string[]
  favoriteWarmupIds: string[]
  hiddenPresetIds: string[]
}

export interface UserProfile {
  id: string
  email: string
  displayName: string
  level: UserLevel
  goals: UserGoals
  bio: string
  createdAt: string
  settings: UserSettings
}

export interface UserGoals {
  targetHoldSeconds: number
  sessionsPerWeek: number
  notes: string
}

export function defaultUserSettings(): UserSettings {
  return {
    theme: 'dark',
    language: 'fr-FR',
    audio: {
      masterVolume: 0.8,
      breathSoundsEnabled: true,
      breathSoundsVolume: 0.5,
      breathSoundsMode: 'synth',
    },
    voice: {
      enabled: true,
      engine: 'web-speech',
      voiceURI: '',
      rate: 1.0,
      volume: 0.9,
    },
    notifications: {
      enabled: false,
      reminderEnabled: false,
      reminderHour: 9,
      reminderMinute: 0,
      reminderDays: [1, 2, 3, 4, 5],
    },
    favoriteExerciseIds: [],
    favoriteTableIds: [],
    favoriteWarmupIds: [],
    hiddenPresetIds: [],
  }
}
