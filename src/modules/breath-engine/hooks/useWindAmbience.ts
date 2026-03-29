/**
 * useWindAmbience — moteur de souffle synthétisé, app-level.
 *
 * Vit dans AppShell : actif sur toutes les pages.
 * Crée son propre AudioContext (distinct de BreathClock et de useRiverAmbience).
 *
 * Architecture simplifiée :
 *   1. AudioContext créé dès que windEnabled=true (geste utilisateur → toggle)
 *   2. Engine start/stop selon shouldPlay (windEnabled && phaseActive)
 *   3. setBreathSpeed() stocke les nouvelles durées → le timer les utilise au cycle suivant
 *   4. Volume → setVolume() live, indépendant
 *
 * Le moteur est silencieux hors session (windBreathPhaseActive = false).
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
  const activeRef   = useRef(false)

  const windEnabled      = useWindStore((s) => s.windEnabled)
  const windVolume       = useWindStore((s) => s.windVolume)
  const windInhaleS      = useWindStore((s) => s.windBreathInhaleS)
  const windExhaleS      = useWindStore((s) => s.windBreathExhaleS)
  const phaseActive      = useWindStore((s) => s.windBreathPhaseActive)
  const overrideActive   = useWindStore((s) => s.windBreathOverrideActive)
  const overrideInhaleS  = useWindStore((s) => s.windBreathOverrideInhaleS)
  const overrideExhaleS  = useWindStore((s) => s.windBreathOverrideExhaleS)

  const effectiveInhaleS = overrideActive ? overrideInhaleS : windInhaleS
  const effectiveExhaleS = overrideActive ? overrideExhaleS : windExhaleS
  const shouldPlay       = windEnabled && phaseActive

  activeRef.current = shouldPlay

  // ── 1. AudioContext + Engine — créés au toggle windEnabled (geste user) ──
  useEffect(() => {
    if (windEnabled) {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx()
      }
      if (!engineRef.current) {
        engineRef.current = new BreathWindEngine(audioCtxRef.current, {
          enabled: true,
          volume:  windVolume,
          breathInhaleS: effectiveInhaleS,
          breathExhaleS: effectiveExhaleS,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windEnabled])

  // ── 2. Volume live ──────────────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.setVolume(windVolume)
  }, [windVolume])

  // ── 3. Durées live — stockées, prises en compte au cycle suivant ────────
  useEffect(() => {
    engineRef.current?.setBreathSpeed(effectiveInhaleS, effectiveExhaleS)
  }, [effectiveInhaleS, effectiveExhaleS])

  // ── 4. Start / Stop — selon shouldPlay ──────────────────────────────────
  useEffect(() => {
    const ctx    = audioCtxRef.current
    const engine = engineRef.current
    if (!ctx || !engine) return

    if (shouldPlay) {
      if (engine.isActive) return   // déjà en cours

      const doStart = () => engine.start(effectiveInhaleS, effectiveExhaleS)

      if (ctx.state === 'suspended') {
        void ctx.resume().then(doStart)
      } else {
        doStart()
      }

      // Reprise après interruption iOS (appel, notification)
      ctx.onstatechange = () => {
        const s = useWindStore.getState()
        if (ctx.state === 'running' && s.windEnabled && s.windBreathPhaseActive && !engine.isActive) {
          const inh = s.windBreathOverrideActive ? s.windBreathOverrideInhaleS : s.windBreathInhaleS
          const exh = s.windBreathOverrideActive ? s.windBreathOverrideExhaleS : s.windBreathExhaleS
          engine.start(inh, exh)
        }
      }
    } else {
      engine.stop()
      if (ctx.onstatechange) ctx.onstatechange = null
    }
    // effectiveInhaleS/ExhaleS : transmis via setBreathSpeed, pas besoin de restart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay])

  // ── 5. Reprise après verrouillage écran ─────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !activeRef.current) return
      const ctx = audioCtxRef.current
      if (!ctx || ctx.state === 'closed') return
      if (ctx.state !== 'running') void ctx.resume()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ── 6. Cleanup au démontage ─────────────────────────────────────────────
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
