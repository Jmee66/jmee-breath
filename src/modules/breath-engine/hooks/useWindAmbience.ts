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
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        const eng = new BreathWindEngine(audioCtxRef.current, {
          enabled: true,
          volume:  windVolume,
          breathInhaleS: effectiveInhaleS,
          breathExhaleS: effectiveExhaleS,
        })
        void eng.load('/sounds/breath-sample.mp3')
        engineRef.current = eng
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

  // ── Helper : relance le wind engine si source morte ─────────────────────
  const tryRecover = () => {
    const ctx    = audioCtxRef.current
    const engine = engineRef.current
    if (!ctx || ctx.state === 'closed' || !engine) return

    const s   = useWindStore.getState()
    if (!s.windEnabled || !s.windBreathPhaseActive) return

    const inh = s.windBreathOverrideActive ? s.windBreathOverrideInhaleS : s.windBreathInhaleS
    const exh = s.windBreathOverrideActive ? s.windBreathOverrideExhaleS : s.windBreathExhaleS

    const doRecover = () => engine.ensurePlaying(inh, exh)

    if (ctx.state !== 'running') {
      void ctx.resume().then(doRecover).catch(() => {})
    } else {
      doRecover()
    }
  }

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
        if (ctx.state === 'running') tryRecover()
      }

      // Watchdog 4 s : détecte source morte sans événement (edge-case iOS)
      if (watchdogRef.current) clearInterval(watchdogRef.current)
      watchdogRef.current = setInterval(() => {
        if (!activeRef.current) return
        const c = audioCtxRef.current
        if (!c || c.state !== 'running') return
        if (engineRef.current && !engineRef.current.isActive) {
          tryRecover()
        }
      }, 4000)

    } else {
      engine.stop()
      if (ctx.onstatechange) ctx.onstatechange = null
      if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null }
    }
    // effectiveInhaleS/ExhaleS : transmis via setBreathSpeed, pas besoin de restart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay])

  // ── 5. Reprise après verrouillage écran ─────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      // Petit délai pour laisser iOS rétablir l'AudioContext
      setTimeout(() => tryRecover(), 300)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ── 6. Cleanup au démontage ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current)
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
