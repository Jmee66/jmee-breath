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

import { useEffect, useRef } from 'react'
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

  const riverEnabled = useRiverStore((s) => s.riverEnabled)
  const riverVolume  = useRiverStore((s) => s.riverVolume)

  enabledRef.current = riverEnabled

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
    } else {
      // Fade out — AudioContext conservé pour ré-enable immédiat
      engineRef.current?.stop()
      animalEngineRef.current?.stop()
    }
    // riverVolume exclu intentionnellement — géré par l'effet volume séparé
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riverEnabled])

  // ── Reprise après verrouillage écran / changement d'onglet ───────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !enabledRef.current) return

      const ctx = audioCtxRef.current
      if (!ctx || ctx.state === 'closed') return

      const doResume = () => {
        // Relance la rivière si la source a été tuée par iOS (interrupted)
        void engineRef.current?.ensurePlaying(RIVER_URL)
        // Relance les oiseaux si leur boucle s'est arrêtée
        if (animalEngineRef.current && !animalEngineRef.current.isRunning) {
          animalEngineRef.current.start()
        }
      }

      if (ctx.state !== 'running') {
        // 'suspended' sur desktop, 'interrupted' sur iOS
        void ctx.resume().then(doResume)
      } else {
        doResume()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  // ── Cleanup au démontage ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      animalEngineRef.current?.stop()
      const ctx = audioCtxRef.current
      if (ctx) setTimeout(() => void ctx.close(), 1600)
      engineRef.current       = null
      animalEngineRef.current = null
      audioCtxRef.current     = null
    }
  }, [])
}
