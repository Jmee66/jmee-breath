import { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useSoundStore }     from '@modules/breath-engine/sounds/soundStore'
import { useRiverStore }     from '@modules/breath-engine/sounds/riverStore'
import { useVoiceGuideStore } from '@modules/breath-engine/voice/voiceGuideStore'

// ── Ligne toggle + slider ─────────────────────────────────────────────────────

function SoundRow({ label, enabled, volume, onToggle, onVolume }: {
  label: string; enabled: boolean; volume: number
  onToggle: () => void; onVolume: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
        <button
          role="switch" aria-checked={enabled} onClick={onToggle}
          style={{
            width: '32px', height: '18px', borderRadius: '9px', border: 'none',
            background: enabled ? 'var(--color-accent)' : 'var(--color-bg-overlay)',
            position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: '2px', left: enabled ? '16px' : '2px',
            width: '14px', height: '14px', borderRadius: '50%',
            background: 'white', transition: 'left 0.2s',
          }} />
        </button>
      </div>
      <input
        type="range" min={0} max={1} step={0.05} value={volume}
        onChange={(e) => onVolume(parseFloat(e.target.value))}
        disabled={!enabled}
        style={{
          width: '100%', accentColor: 'var(--color-accent)',
          opacity: enabled ? 1 : 0.3, cursor: enabled ? 'pointer' : 'default',
        }}
      />
    </div>
  )
}

// ── Bouton son global ─────────────────────────────────────────────────────────

/**
 * Bouton Volume accessible depuis toutes les pages.
 * Sur mobile   : flottant en haut à droite (position fixed).
 * Sur desktop  : intégré dans la SideNav.
 *
 * Props :
 *   variant="floating"  → bouton positionné en fixed (AppShell mobile)
 *   variant="inline"    → bouton sans position absolue (SideNav desktop)
 */
export function GlobalSoundButton({ variant = 'floating' }: { variant?: 'floating' | 'inline' }) {
  const [open, setOpen] = useState(false)

  const soundEnabled    = useSoundStore((s) => s.soundEnabled)
  const soundVolume     = useSoundStore((s) => s.soundVolume)
  const setSoundEnabled = useSoundStore((s) => s.setSoundEnabled)
  const setSoundVolume  = useSoundStore((s) => s.setSoundVolume)

  const riverEnabled    = useRiverStore((s) => s.riverEnabled)
  const riverVolume     = useRiverStore((s) => s.riverVolume)
  const setRiverEnabled = useRiverStore((s) => s.setRiverEnabled)
  const setRiverVolume  = useRiverStore((s) => s.setRiverVolume)

  const voiceEnabled    = useVoiceGuideStore((s) => s.voiceEnabled)
  const voiceVolume     = useVoiceGuideStore((s) => s.voiceVolume)
  const setVoiceEnabled = useVoiceGuideStore((s) => s.setVoiceEnabled)
  const setVoiceVolume  = useVoiceGuideStore((s) => s.setVoiceVolume)

  const anyEnabled = soundEnabled || riverEnabled || voiceEnabled

  const buttonEl = (
    <button
      onClick={() => setOpen((v) => !v)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '36px', height: '36px',
        borderRadius: '10px',
        border: '1px solid var(--color-border)',
        background: open ? 'var(--color-bg-elevated)' : 'transparent',
        color: 'var(--color-text-muted)',
        opacity: anyEnabled ? 1 : 0.5,
        cursor: 'pointer',
      }}
      aria-label="Réglages son"
    >
      {anyEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </button>
  )

  const panel = open ? (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{ position: 'fixed', inset: 0, zIndex: 49 }}
      />
      <div style={{
        position: 'absolute',
        top: variant === 'floating' ? '44px' : 'auto',
        bottom: variant === 'inline'   ? '44px' : 'auto',
        right: 0,
        zIndex: 50,
        width: '210px',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '14px',
        padding: '12px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <SoundRow label="Sons"    enabled={soundEnabled} volume={soundVolume} onToggle={() => setSoundEnabled(!soundEnabled)} onVolume={setSoundVolume} />
        <SoundRow label="Rivière" enabled={riverEnabled} volume={riverVolume} onToggle={() => setRiverEnabled(!riverEnabled)} onVolume={setRiverVolume} />
        <SoundRow label="Voix"    enabled={voiceEnabled} volume={voiceVolume} onToggle={() => setVoiceEnabled(!voiceEnabled)} onVolume={setVoiceVolume} />
      </div>
    </>
  ) : null

  if (variant === 'floating') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: '16px',
          zIndex: 40,
        }}
      >
        {buttonEl}
        {panel}
      </div>
    )
  }

  // inline (SideNav desktop)
  return (
    <div style={{ position: 'relative' }}>
      {buttonEl}
      {panel}
    </div>
  )
}
