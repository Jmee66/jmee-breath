/**
 * useNoSleep — empêche le verrouillage écran sur iOS et Android
 * pendant une session active.
 *
 * Technique : NoSleep.js joue une vidéo silencieuse en boucle.
 * Sur iOS, une vidéo en lecture active empêche le sleep système
 * (même sans Wake Lock API qui n'est pas supporté sur iOS Chrome).
 *
 * Règle : enable() DOIT être appelé depuis un geste utilisateur
 * (touchstart / click) — iOS exige un geste pour lancer la vidéo.
 */
import { useRef, useCallback } from 'react'
import NoSleep from 'nosleep.js'

export function useNoSleep() {
  const noSleepRef = useRef<NoSleep | null>(null)

  const enable = useCallback(() => {
    try {
      if (!noSleepRef.current) {
        noSleepRef.current = new NoSleep()
      }
      void noSleepRef.current.enable()
    } catch {
      // Navigateur non supporté — on continue sans
    }
  }, [])

  const disable = useCallback(() => {
    try {
      noSleepRef.current?.disable()
    } catch { /* ignore */ }
  }, [])

  return { enable, disable }
}
