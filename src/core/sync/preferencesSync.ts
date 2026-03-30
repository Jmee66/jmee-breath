/**
 * preferencesSync — synchronisation bidirectionnelle des préférences utilisateur.
 *
 * Données synchronisées (table Supabase : user_preferences) :
 *  · Son    : soundStore, droneStore, riverStore, windStore
 *  · Voix   : voiceGuideStore
 *  · Réglages utilisateur : settingsStore (favoris, thème, langue, hiddenPresets…)
 *
 * Stratégie :
 *  · Push  : debounce 1,5 s après tout changement de store → enqueue SyncManager
 *  · Pull  : au login (userId change null→string) et au retour au premier plan
 *  · Conflit : le remote gagne (last-write-wins côté serveur via updated_at)
 */

import { useEffect, useRef } from 'react'
import { supabase } from '../supabase/client'
import { syncManager } from './syncManager'
import { useAuthStore } from '@modules/auth/store/authStore'
import { useSoundStore } from '@modules/breath-engine/sounds/soundStore'
import { useDroneStore } from '@modules/breath-engine/sounds/droneStore'
import { useRiverStore } from '@modules/breath-engine/sounds/riverStore'
import { useVoiceGuideStore } from '@modules/breath-engine/voice/voiceGuideStore'
import { useWindStore } from '@modules/breath-engine/sounds/windStore'
import { useSettingsStore } from '@modules/settings/store/settingsStore'
import type { UserSettings } from '@core/types'
import type { SoundSet } from '@modules/breath-engine/sounds/soundTypes'

// ── Types payload ─────────────────────────────────────────────────────────────

interface WindPrefs {
  windEnabled:       boolean
  windVolume:        number
  windBreathInhaleS: number
  windBreathExhaleS: number
}

interface SoundPrefs {
  soundEnabled: boolean
  soundVolume:  number
  soundSet:     SoundSet
  bowlOnPhase:  boolean
  droneEnabled: boolean
  droneVolume:  number
  riverEnabled: boolean
  riverVolume:  number
}

interface VoicePrefs {
  voiceEnabled: boolean
  voiceVolume:  number
  voiceRate:    number
  voicePitch:   number
}

interface UserPreferencesRow {
  user_id:    string
  sound:      SoundPrefs
  wind?:      WindPrefs
  voice:      VoicePrefs
  settings:   UserSettings
  updated_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collecte l'état courant de tous les stores de préférences. */
function buildPayload(userId: string): UserPreferencesRow {
  const snd = useSoundStore.getState()
  const drn = useDroneStore.getState()
  const rvr = useRiverStore.getState()
  const wnd = useWindStore.getState()
  const vce = useVoiceGuideStore.getState()
  const stg = useSettingsStore.getState()

  return {
    user_id: userId,
    sound: {
      soundEnabled: snd.soundEnabled,
      soundVolume:  snd.soundVolume,
      soundSet:     snd.soundSet,
      bowlOnPhase:  snd.bowlOnPhase,
      droneEnabled: drn.droneEnabled,
      droneVolume:  drn.droneVolume,
      riverEnabled: rvr.riverEnabled,
      riverVolume:  rvr.riverVolume,
    },
    wind: {
      windEnabled:       wnd.windEnabled,
      windVolume:        wnd.windVolume,
      windBreathInhaleS: wnd.windBreathInhaleS,
      windBreathExhaleS: wnd.windBreathExhaleS,
    },
    voice: {
      voiceEnabled: vce.voiceEnabled,
      voiceVolume:  vce.voiceVolume,
      voiceRate:    vce.voiceRate,
      voicePitch:   vce.voicePitch,
    },
    settings:   stg.settings,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Applique les préférences tirées de Supabase sur tous les stores locaux.
 * Appelé après un pull réussi.
 */
async function applyRemotePreferences(row: UserPreferencesRow): Promise<void> {
  // ── Son ──────────────────────────────────────────────────────────────────
  if (row.sound) {
    const s = row.sound
    useSoundStore.setState({
      soundEnabled: s.soundEnabled,
      soundVolume:  s.soundVolume,
      soundSet:     s.soundSet,
      bowlOnPhase:  s.bowlOnPhase,
    })
    useDroneStore.setState({ droneEnabled: s.droneEnabled, droneVolume: s.droneVolume })
    useRiverStore.setState({ riverEnabled: s.riverEnabled, riverVolume: s.riverVolume })
  }

  // ── Souffle (wind) ─────────────────────────────────────────────────────────
  if (row.wind) {
    const w = row.wind
    useWindStore.setState({
      windEnabled:       w.windEnabled,
      windVolume:        w.windVolume,
      windBreathInhaleS: w.windBreathInhaleS,
      windBreathExhaleS: w.windBreathExhaleS,
    })
  }

  // ── Voix ─────────────────────────────────────────────────────────────────
  if (row.voice) {
    const v = row.voice
    useVoiceGuideStore.setState({
      voiceEnabled: v.voiceEnabled,
      voiceVolume:  v.voiceVolume,
      voiceRate:    v.voiceRate,
      voicePitch:   v.voicePitch,
    })
  }

  // ── Réglages utilisateur (IndexedDB + store) ──────────────────────────────
  if (row.settings) {
    await useSettingsStore.getState().update(row.settings)
  }
}

/**
 * Tire les préférences depuis Supabase et les applique localement.
 * Silencieux en cas d'erreur (pas de compte, première connexion, réseau…).
 */
async function pullAndApply(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !data) return   // Pas encore de préférences en remote — normal au 1er login
    await applyRemotePreferences(data as UserPreferencesRow)
  } catch {
    // Réseau indisponible ou table inexistante — on continue en local
  }
}

// ── Hook principal ────────────────────────────────────────────────────────────

/**
 * usePreferencesSync — à appeler une seule fois depuis AppShell.
 *
 * · S'abonne à tous les stores de préférences (subscribe sans re-render).
 * · Debounce 1,5 s → enqueue dans SyncManager (push offline-first).
 * · Pull au login et au retour au premier plan.
 */
/** Force l'enqueue des préférences (appelé par forceSync). */
export function enqueuePreferencesNow(userId: string): void {
  void syncManager.enqueue({
    table:     'user_preferences',
    operation: 'upsert',
    recordId:  userId,
    payload:   buildPayload(userId),
    createdAt: new Date().toISOString(),
  })
}

export function usePreferencesSync(): void {
  const userId    = useAuthStore((s) => s.user?.id ?? null)
  const userIdRef = useRef<string | null>(null)

  // Sync userIdRef avec le state React (accessible dans les callbacks sans stale closure)
  useEffect(() => { userIdRef.current = userId }, [userId])

  // ── Push : debounce 1,5 s après tout changement de store ─────────────────
  useEffect(() => {
    if (!userId) return

    const debounceRef = { timer: null as ReturnType<typeof setTimeout> | null }

    const scheduleSync = () => {
      if (debounceRef.timer) clearTimeout(debounceRef.timer)
      debounceRef.timer = setTimeout(() => {
        const uid = userIdRef.current
        if (!uid) return
        void syncManager.enqueue({
          table:      'user_preferences',
          operation:  'upsert',
          recordId:   uid,
          payload:    buildPayload(uid),
          createdAt:  new Date().toISOString(),
        })
      }, 1500)
    }

    // Abonnements bruts (pas de re-render) à tous les stores de préférences
    const unsubs = [
      useSoundStore.subscribe(scheduleSync),
      useDroneStore.subscribe(scheduleSync),
      useRiverStore.subscribe(scheduleSync),
      useWindStore.subscribe(scheduleSync),
      useVoiceGuideStore.subscribe(scheduleSync),
      useSettingsStore.subscribe(scheduleSync),
    ]

    return () => {
      if (debounceRef.timer) clearTimeout(debounceRef.timer)
      unsubs.forEach((u) => u())
    }
  }, [userId])

  // ── Pull : au login ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    void pullAndApply(userId)
  }, [userId])

  // ── Pull : au retour au premier plan ──────────────────────────────────────
  useEffect(() => {
    const onVisible = () => {
      const uid = userIdRef.current
      if (uid && document.visibilityState === 'visible') {
        void pullAndApply(uid)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}
