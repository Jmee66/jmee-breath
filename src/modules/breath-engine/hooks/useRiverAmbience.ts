/**
 * useRiverAmbience — lecteur de rivière autonome (app-level).
 *
 * Vit dans AppShell : actif sur toutes les pages, indépendamment des sessions.
 * Crée son propre AudioContext (distinct de celui de BreathClock).
 *
 * Cycle de vie :
 *  · riverEnabled → true  : AudioContext créé (lazy) + fetch/decode du WAV + lecture en boucle
 *  · riverEnabled → false : fade out 1.5 s — AudioContext conservé pour ré-enable rapide
 *  · riverVolume change   : setVolume() live (lissage 80 ms)
 *  · page cachée/visible  : AudioContext suspendu/repris
 *  · démontage            : stop + fermeture AudioContext après fade (1.6 s)
 *
 * Le buffer WAV est mis en cache au niveau module (un seul fetch pour toute
 * la durée de vie de l'app, partagé entre les instances de BreathRiverEngine).
 */

import { useEffect, useRef, useCallback } from 'react'
import { useRiverStore } from '../sounds/riverStore'
import { BreathRiverEngine } from '../sounds/BreathRiverEngine'
import { BreathAnimalEngine } from '../sounds/BreathAnimalEngine'

// URL du fichier audio — BASE_URL gère le basename Vite (/jmee-breath/)
const RIVER_URL = `${import.meta.env.BASE_URL}sounds/river.wav`

// Fallback webkit — même pattern que BreathClock
const AudioCtx: typeof AudioContext =
  typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    : AudioContext

export function useRiverAmbience(): void {
  const engineRef       = useRef<BreathRiverEngine | null>(null)
  const animalEngineRef = useRef<BreathAnimalEngine | null>(null)
  const audioCtxRef     = useRef<AudioContext | null>(null)
  const enabledRef      = useRef(false)   // Lecture dans le handler sans dépendance
  const watchdogRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  const riverEnabled = useRiverStore((s) => s.riverEnabled)
  const riverVolume  = useRiverStore((s) => s.riverVolume)

  enabledRef.current = riverEnabled

  // ── Helper : relance rivière + oiseaux si morts ───────────────────────
  const tryRecover = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed' || !enabledRef.current) return

    const doRecover = () => {
      void engineRef.current?.ensurePlaying(RIVER_URL)
      if (animalEngineRef.current && !animalEngineRef.current.isRunning) {
        animalEngineRef.current.start()
      }
    }

    if (ctx.state !== 'running') {
      void ctx.resume().then(doRecover).catch(() => {})
    } else {
      doRecover()
    }
  }, [])

  // ── Volume live ───────────────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.setVolume(riverVolume)
    // Les animaux suivent le même curseur (atténués intrinsèquement par leurs gains)
    animalEngineRef.current?.setVolume(riverVolume)
  }, [riverVolume])

  // ── Start / Stop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (riverEnabled) {
      // Création lazy de l'AudioContext (une seule fois par session)
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx()
        engineRef.current   = new BreathRiverEngine(audioCtxRef.current, {
          enabled: true,
          volume:  riverVolume,
        })
      }

      const ctx    = audioCtxRef.current
      const engine = engineRef.current!

      // Crée le moteur animalier sur le même AudioContext (une seule fois)
      if (!animalEngineRef.current) {
        animalEngineRef.current = new BreathAnimalEngine(ctx, riverVolume)
      }

      const doStart = () => {
        void engine.loadAndStart(RIVER_URL)
        animalEngineRef.current?.start()
      }

      if (ctx.state === 'suspended') {
        // AudioContext suspendu (restauré depuis localStorage sans geste utilisateur)
        void ctx.resume().then(doStart)
      } else {
        doStart()
      }

      // ── onstatechange : reprend si AudioContext interrompu (notif, appel iOS) ──
      ctx.onstatechange = () => {
        if (ctx.state === 'running' && enabledRef.current) {
          void engineRef.current?.ensurePlaying(RIVER_URL)
          if (animalEngineRef.current && !animalEngineRef.current.isRunning) {
            animalEngineRef.current.start()
          }
        }
      }

      // ── Watchdog 4 s : détecte une source morte sans événement (iOS edge-case) ──
      if (watchdogRef.current) clearInterval(watchdogRef.current)
      watchdogRef.current = setInterval(() => {
        if (!enabledRef.current) return
        const c = audioCtxRef.current
        if (!c || c.state !== 'running') return
        // Source morte alors qu'elle devrait jouer → relance silencieuse
        if (engineRef.current && !engineRef.current.isActive) {
          void engineRef.current.ensurePlaying(RIVER_URL)
        }
        if (animalEngineRef.current && !animalEngineRef.current.isRunning) {
          animalEngineRef.current.start()
        }
      }, 4000)

    } else {
      // Fade out — AudioContext conservé pour ré-enable immédiat
      engineRef.current?.stop()
      animalEngineRef.current?.stop()
      if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null }
    }
    // riverVolume exclu intentionnellement — géré par l'effet volume séparé
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riverEnabled])

  // ── Reprise après verrouillage écran / changement d'onglet ───────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      tryRecover()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [tryRecover])

  // ── Cleanup au démontage ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current)
      engineRef.current?.stop()
      animalEngineRef.current?.stop()
      const ctx = audioCtxRef.current
      if (ctx) {
        ctx.onstatechange = null
        setTimeout(() => void ctx.close(), 1600)
      }
      engineRef.current       = null
      animalEngineRef.current = null
      audioCtxRef.current     = null
    }
  }, [])
}
