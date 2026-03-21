import { supabase } from '@core/supabase'
import { eventBus } from '@core/events'
import { syncManager } from '@core/sync'
import { useAuthStore } from '../store/authStore'

/** Initialise l'écoute du state Supabase Auth — appeler une fois au démarrage */
export function initAuth(): () => void {
  const { setUser, setSession, setLoading } = useAuthStore.getState()

  // Session initiale
  void supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session)
    setUser(session?.user ?? null)
    setLoading(false)
    if (session?.user) {
      syncManager.setUserId(session.user.id)
      eventBus.emit('USER_SIGNED_IN', {
        userId: session.user.id,
        email: session.user.email ?? '',
      })
    }
  })

  // Écoute des changements
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      if (event === 'SIGNED_IN' && session?.user) {
        syncManager.setUserId(session.user.id)
        eventBus.emit('USER_SIGNED_IN', {
          userId: session.user.id,
          email: session.user.email ?? '',
        })
      } else if (event === 'SIGNED_OUT') {
        syncManager.setUserId(null)
        eventBus.emit('USER_SIGNED_OUT', {})
      }
    },
  )

  return () => subscription.unsubscribe()
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}
