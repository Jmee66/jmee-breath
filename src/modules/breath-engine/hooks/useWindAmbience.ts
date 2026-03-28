/**
 * useWindAmbience — moteur de souffle synthétisé, app-level.
 *
 * Vit dans AppShell : actif sur toutes les pages.
 * Crée son propre AudioContext (distinct de BreathClock et de useRiverAmbience).
 *
 * Cycle de vie :
 *   · windEnabled + windBreathPhaseActive → true : démarre le moteur
 *   · windBreathPhaseActive → false              : fondu 150 ms (fin de phase)
 *   · windEnabled → false                        : fondu 150 ms immédiat
 *   · windVolume change                          : setVolume() live
 *   · durées effectives change                   : setBreathSpeed() live
 *
 * Hiérarchie des durées :
 *   overrideActive → overrideInhaleS/ExhaleS (per-phase explicite)
 *   sinon          → windBreathInhaleS/ExhaleS (sliders globaux, réactifs)
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

  // Durées effectives : per-phase > réglages globaux (live)
  const effectiveInhaleS = overrideActive ? overrideInhaleS : windInhaleS
  const effectiveExhaleS = overrideActive ? overrideExhaleS : windExhaleS

  // Moteur actif uniquement pendant les phases recovery/ventilation
  const shouldPlay = windEnabled && phaseActive

  activeRef.current = shouldPlay

  // ── Volume live ───────────────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.setVolume(windVolume)
  }, [windVolume])

  // ── Durées live (réglages globaux OU override per-phase) ──────────────
  useEffect(() => {
    if (shouldPlay) {
      engineRef.current?.setBreathSpeed(effectiveInhaleS, effectiveExhaleS)
    }
  }, [shouldPlay, effectiveInhaleS, effectiveExhaleS])

  // ── Start / Stop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (shouldPlay) {
      // Création lazy de l'AudioContext
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx()
        engineRef.current   = new BreathWindEngine(audioCtxRef.current, {
          enabled:       true,
          volume:        windVolume,
          breathInhaleS: effectiveInhaleS,
          breathExhaleS: effectiveExhaleS,
        })
      }

      const ctx    = audioCtxRef.current!
      const engine = engineRef.current!

      const doStart = () => engine.start(effectiveInhaleS, effectiveExhaleS)

      if (ctx.state === 'suspended') {
        void ctx.resume().then(doStart)
      } else {
        doStart()
      }

      // Reprise après interruption iOS
      ctx.onstatechange = () => {
        const s = useWindStore.getState()
        if (ctx.state === 'running' && s.windEnabled && s.windBreathPhaseActive && engineRef.current?.isActive === false) {
          const inh = s.windBreathOverrideActive ? s.windBreathOverrideInhaleS : s.windBreathInhaleS
          const exh = s.windBreathOverrideActive ? s.windBreathOverrideExhaleS : s.windBreathExhaleS
          engineRef.current?.start(inh, exh)
        }
      }
    } else {
      engineRef.current?.stop()
    }
    // effectiveInhaleS/ExhaleS exclus — gérés par l'effet durées séparé
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
