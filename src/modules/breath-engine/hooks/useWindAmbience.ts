/**
 * useWindAmbience — moteur de souffle synthétisé, app-level.
 *
 * Vit dans AppShell : actif sur toutes les pages.
 * Crée son propre AudioContext (distinct de BreathClock et de useRiverAmbience).
 *
 * Cycle de vie :
 *   · windEnabled = true + overrideActive = true  : démarre (phase ventilation/récupération)
 *   · overrideActive → false                      : fondu 150 ms (fin de phase)
 *   · windEnabled → false                         : fondu 150 ms immédiat
 *   · windVolume change                           : setVolume() live
 *   · override InhaleS/ExhaleS change             : setBreathSpeed() live
 *
 * Le son ne joue QUE pendant les phases recovery/ventilation où TableRunner
 * a positionné un override de durée. Silencieux hors session.
 */

import { useEffect, useRef } from 'react'
import { useWindStore } from '../sounds/windStore'
import { BreathWindEngine } from '../sounds/BreathWindEngine'

const AudioCtx: typeof AudioContext =
  typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    : AudioContext

export function useWindAmbience(): void {
  const engineRef   = useRef<BreathWindEngine | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const activeRef   = useRef(false)   // true quand le moteur est en cours de lecture

  const windEnabled     = useWindStore((s) => s.windEnabled)
  const windVolume      = useWindStore((s) => s.windVolume)
  const overrideActive  = useWindStore((s) => s.windBreathOverrideActive)
  const overrideInhaleS = useWindStore((s) => s.windBreathOverrideInhaleS)
  const overrideExhaleS = useWindStore((s) => s.windBreathOverrideExhaleS)

  // Le moteur tourne uniquement si l'utilisateur a activé le son ET qu'une phase l'exige
  const shouldPlay = windEnabled && overrideActive

  activeRef.current = shouldPlay

  // ── Volume live ───────────────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.setVolume(windVolume)
  }, [windVolume])

  // ── Vitesse live (durées d'override) ──────────────────────────────────
  useEffect(() => {
    if (shouldPlay) {
      engineRef.current?.setBreathSpeed(overrideInhaleS, overrideExhaleS)
    }
  }, [shouldPlay, overrideInhaleS, overrideExhaleS])

  // ── Start / Stop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (shouldPlay) {
      // Création lazy de l'AudioContext
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx()
        engineRef.current   = new BreathWindEngine(audioCtxRef.current, {
          enabled:       true,
          volume:        windVolume,
          breathInhaleS: overrideInhaleS,
          breathExhaleS: overrideExhaleS,
        })
      }

      const ctx    = audioCtxRef.current!
      const engine = engineRef.current!

      const doStart = () => engine.start(overrideInhaleS, overrideExhaleS)

      if (ctx.state === 'suspended') {
        void ctx.resume().then(doStart)
      } else {
        doStart()
      }

      // Reprise après interruption iOS
      ctx.onstatechange = () => {
        const s = useWindStore.getState()
        if (ctx.state === 'running' && s.windEnabled && s.windBreathOverrideActive && engineRef.current?.isActive === false) {
          engineRef.current?.start(s.windBreathOverrideInhaleS, s.windBreathOverrideExhaleS)
        }
      }
    } else {
      engineRef.current?.stop()
    }
    // overrideInhaleS/ExhaleS exclus — gérés par l'effet vitesse séparé
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay])

  // ── Reprise après verrouillage écran ─────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !activeRef.current) return
      const ctx = audioCtxRef.current
      if (!ctx || ctx.state === 'closed') return
      if (ctx.state !== 'running') {
        void ctx.resume()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ── Cleanup au démontage ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      const ctx = audioCtxRef.current
      if (ctx) {
        ctx.onstatechange = null
        setTimeout(() => void ctx.close(), 300)
      }
      engineRef.current   = null
      audioCtxRef.current = null
    }
  }, [])
}
