import { useEffect, useRef } from 'react'
import { X, Pause, Play } from 'lucide-react'
import type { Exercise } from '@core/types'
import { useBreathSession } from '../hooks/useBreathSession'
import { useBreathStore } from '../store/breathStore'
import { BreathVisual } from '../graphics/BreathVisual'
import { BreathText } from '../text/BreathText'

interface BreathScreenProps {
  exercise: Exercise
  onComplete: () => void
  onExit: () => void
}

/**
 * Écran de session plein écran.
 * Échappe AppShell via position:fixed + zIndex:50.
 */
export function BreathScreen({ exercise, onComplete, onExit }: BreathScreenProps) {
  const { start, pause, resume, stop } = useBreathSession()
  const isPaused = useBreathStore((s) => s.isPaused)
  const isRunning = useBreathStore((s) => s.isRunning)

  // Démarre la session au montage
  useEffect(() => {
    void start(exercise)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redirige quand la session se termine naturellement
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (isRunning) {
      hasStartedRef.current = true
    } else if (hasStartedRef.current) {
      onComplete()
    }
  }, [isRunning, onComplete])

  function handlePauseResume() {
    if (isPaused) resume()
    else pause()
  }

  function handleExit() {
    stop(true)
    onExit()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'var(--color-bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '40px',
        padding: '0 24px',
      }}
    >
      {/* Bouton quitter — haut gauche */}
      <button
        onClick={handleExit}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          left: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          background: 'transparent',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
        }}
        aria-label="Arrêter la session"
      >
        <X size={18} />
      </button>

      {/* Visuel principal */}
      <BreathVisual />

      {/* Texte (phase, countdown, rep) */}
      <BreathText />

      {/* Bouton pause/reprendre */}
      <button
        onClick={handlePauseResume}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 24px',
          borderRadius: '14px',
          border: '1px solid var(--color-border)',
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
        }}
        aria-label={isPaused ? 'Reprendre' : 'Pause'}
      >
        {isPaused
          ? <><Play size={14} fill="currentColor" /> Reprendre</>
          : <><Pause size={14} /> Pause</>
        }
      </button>
    </div>
  )
}
