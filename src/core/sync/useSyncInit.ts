/**
 * useSyncInit — initialise l'auth Supabase + SyncManager au démarrage.
 * Délègue à authService.initAuth() qui gère déjà la session, le SyncManager
 * et les événements USER_SIGNED_IN / USER_SIGNED_OUT.
 */

import { useEffect } from 'react'
import { initAuth } from '@modules/auth/services/authService'

export function useSyncInit(): void {
  useEffect(() => {
    const unsubscribe = initAuth()
    return unsubscribe
  }, [])
}
