import { useEffect, useRef, useState } from 'react'
import { X, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import type { Exercise } from '@core/types'
import { useBreathSession } from '../hooks/useBreathSession'
import { useBreathStore } from '../store/breathStore'
import { useSoundStore } from '../sounds/soundStore'
import { useDroneStore } from '../sounds/droneStore'
import { useRiverStore } from '../sounds/riverStore'
import { useVoiceGuideStore } from '../voice/voiceGuideStore'
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
  const isPaused  = useBreathStore((s) => s.isPaused)
  const isRunning = useBreathStore((s) => s.isRunning)

  const soundEnabled    = useSoundStore((s) => s.soundEnabled)
  const soundVolume     = useSoundStore((s) => s.soundVolume)
  const setSoundEnabled = useSoundStore((s) => s.setSoundEnabled)
  const setSoundVolume  = useSoundStore((s) => s.setSoundVolume)

  const droneEnabled    = useDroneStore((s) => s.droneEnabled)
  const droneVolume     = useDroneStore((s) => s.droneVolume)
  const setDroneEnabled = useDroneStore((s) => s.setDroneEnabled)
  const setDroneVolume  = useDroneStore((s) => s.setDroneVolume)

  const riverEnabled    = useRiverStore((s) => s.riverEnabled)
  const riverVolume     = useRiverStore((s) => s.riverVolume)
  const setRiverEnabled = useRiverStore((s) => s.setRiverEnabled)
  const setRiverVolume  = useRiverStore((s) => s.setRiverVolume)

  const voiceEnabled    = useVoiceGuideStore((s) => s.voiceEnabled)
  const voiceVolume     = useVoiceGuideStore((s) => s.voiceVolume)
  const setVoiceEnabled = useVoiceGuideStore((s) => s.setVoiceEnabled)
  const setVoiceVolume  = useVoiceGuideStore((s) => s.setVoiceVolume)

  const [showSoundPanel, setShowSoundPanel] = useState(false)

  useEffect(() => {
    void start(exercise)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const anyEnabled = soundEnabled || droneEnabled || riverEnabled || voiceEnabled

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0, left: 0,
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
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '40px', height: '40px',
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

      {/* Zone son — haut droit */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: '20px', zIndex: 10 }}>
        <button
          onClick={() => setShowSoundPanel((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '40px', height: '40px',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            background: showSoundPanel ? 'var(--color-bg-elevated)' : 'transparent',
            color: 'var(--color-text-muted)',
            opacity: anyEnabled ? 1 : 0.4,
            cursor: 'pointer',
          }}
          aria-label="Réglages son"
        >
          {anyEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>

        {showSoundPanel && (
          <div
            style={{
              position: 'absolute',
              top: '48px',
              right: 0,
              width: '220px',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '16px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <SoundRow
              label="Bips"
              enabled={soundEnabled}
              volume={soundVolume}
              onToggle={() => setSoundEnabled(!soundEnabled)}
              onVolume={setSoundVolume}
            />
            <SoundRow
              label="Fond"
              enabled={droneEnabled}
              volume={droneVolume}
              onToggle={() => setDroneEnabled(!droneEnabled)}
              onVolume={setDroneVolume}
            />
            <SoundRow
              label="Rivière"
              enabled={riverEnabled}
              volume={riverVolume}
              onToggle={() => setRiverEnabled(!riverEnabled)}
              onVolume={setRiverVolume}
            />
            <SoundRow
              label="Voix"
              enabled={voiceEnabled}
              volume={voiceVolume}
              onToggle={() => setVoiceEnabled(!voiceEnabled)}
              onVolume={setVoiceVolume}
            />
          </div>
        )}
      </div>

      {/* Backdrop pour fermer le panneau */}
      {showSoundPanel && (
        <div
          onClick={() => setShowSoundPanel(false)}
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9 }}
        />
      )}

      <BreathVisual />
      <BreathText />

      <button
        onClick={handlePauseResume}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '12px 24px',
          borderRadius: '14px',
          border: '1px solid var(--color-border)',
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          fontSize: '14px', fontWeight: 500,
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

// ── Ligne son : label + toggle + slider ──────────────────────────────────────

function SoundRow({ label, enabled, volume, onToggle, onVolume }: {
  label: string
  enabled: boolean
  volume: number
  onToggle: () => void
  onVolume: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          style={{
            width: '32px', height: '18px',
            borderRadius: '9px',
            border: 'none',
            background: enabled ? 'var(--color-accent)' : 'var(--color-bg-overlay)',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute',
            top: '2px',
            left: enabled ? '16px' : '2px',
            width: '14px', height: '14px',
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s',
          }} />
        </button>
      </div>
      <input
        type="range"
        min={0} max={1} step={0.05}
        value={volume}
        onChange={(e) => onVolume(parseFloat(e.target.value))}
        disabled={!enabled}
        style={{
          width: '100%',
          accentColor: 'var(--color-accent)',
          opacity: enabled ? 1 : 0.3,
          cursor: enabled ? 'pointer' : 'default',
        }}
      />
    </div>
  )
}
