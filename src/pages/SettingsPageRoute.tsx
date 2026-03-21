import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { useSoundStore, useVoiceGuideStore, useDroneStore } from '@modules/breath-engine'
import type { SoundSet } from '@modules/breath-engine'
import { Volume2, VolumeX } from 'lucide-react'
import { version } from '../../package.json'

// ── Helpers UI ────────────────────────────────────────────────────────────────

function GroupHeader({ children, open, onToggle }: {
  children: React.ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--color-bg-overlay)',
        padding: '8px 16px',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {children}
      </p>
      <ChevronDown
        size={14}
        className="text-text-muted"
        style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}
      />
    </button>
  )
}

function SettingRow({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', padding: '14px 16px' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-muted" style={{ marginTop: '2px' }}>{hint}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function SliderRow({ label, hint, value, onChange, min, max, step, disabled, iconLeft, iconRight }: {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  disabled?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
}) {
  return (
    <div style={{ padding: '14px 16px', pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.4 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {iconLeft}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--color-accent)' }}
        />
        {iconRight}
      </div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        border: 'none',
        background: value ? 'var(--color-accent)' : 'var(--color-bg-overlay)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          left: value ? '23px' : '3px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.2s',
        }}
      />
    </button>
  )
}

const SOUND_SET_LABELS: Record<SoundSet, string> = {
  bowl:    'Bol',
  sine:    'Doux',
  crystal: 'Cristal',
  minimal: 'Minimal',
}

const SOUND_SET_HINTS: Record<SoundSet, string> = {
  bowl:    'Bol tibétain synthétisé, longue résonance',
  sine:    'Onde sinusoïdale, attaque douce',
  crystal: 'Triangle, résonance longue',
  minimal: 'Bip court et discret',
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPageRoute() {
  // Sections ouvertes/fermées
  const [openPhase, setOpenPhase]   = useState(true)
  const [openDrone, setOpenDrone]   = useState(true)
  const [openVoice, setOpenVoice]   = useState(true)

  // Sons de phases
  const soundEnabled    = useSoundStore((s) => s.soundEnabled)
  const soundVolume     = useSoundStore((s) => s.soundVolume)
  const soundSet        = useSoundStore((s) => s.soundSet)
  const setSoundEnabled = useSoundStore((s) => s.setSoundEnabled)
  const setSoundVolume  = useSoundStore((s) => s.setSoundVolume)
  const setSoundSet     = useSoundStore((s) => s.setSoundSet)

  // Fond sonore continu
  const droneEnabled    = useDroneStore((s) => s.droneEnabled)
  const droneVolume     = useDroneStore((s) => s.droneVolume)
  const setDroneEnabled = useDroneStore((s) => s.setDroneEnabled)
  const setDroneVolume  = useDroneStore((s) => s.setDroneVolume)

  // Guidage vocal
  const voiceEnabled    = useVoiceGuideStore((s) => s.voiceEnabled)
  const voiceVolume     = useVoiceGuideStore((s) => s.voiceVolume)
  const voiceRate       = useVoiceGuideStore((s) => s.voiceRate)
  const setVoiceEnabled = useVoiceGuideStore((s) => s.setVoiceEnabled)
  const setVoiceVolume  = useVoiceGuideStore((s) => s.setVoiceVolume)
  const setVoiceRate    = useVoiceGuideStore((s) => s.setVoiceRate)

  return (
    <PageContainer title="Réglages">

      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Son & Voix
        </h2>

        {/* Carte unique — tous les réglages sonores */}
        <div className="card divide-y divide-border overflow-hidden p-0">

          {/* ── Sons de phase ────────────────────────────────────────────── */}
          <GroupHeader open={openPhase} onToggle={() => setOpenPhase((v) => !v)}>
            Sons de phase
          </GroupHeader>

          {openPhase && <>
            <SettingRow
              label="Sons de respiration"
              hint="Bip à chaque changement de phase"
            >
              <Toggle value={soundEnabled} onChange={setSoundEnabled} />
            </SettingRow>

            <SliderRow
              label="Volume"
              value={soundVolume}
              onChange={setSoundVolume}
              min={0} max={1} step={0.05}
              disabled={!soundEnabled}
              iconLeft={<VolumeX size={13} className="text-text-muted" />}
              iconRight={<Volume2 size={13} className="text-text-muted" />}
            />

            {/* Sélecteur de timbre */}
            <div style={{ padding: '14px 16px', pointerEvents: !soundEnabled ? 'none' : 'auto', opacity: !soundEnabled ? 0.4 : 1 }}>
              <p className="text-sm font-medium text-text-primary" style={{ marginBottom: '10px' }}>Timbre</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['bowl', 'sine', 'crystal', 'minimal'] as SoundSet[]).map((set) => (
                  <button
                    key={set}
                    onClick={() => setSoundSet(set)}
                    title={SOUND_SET_HINTS[set]}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      borderRadius: '10px',
                      border: soundSet === set
                        ? '1.5px solid var(--color-accent)'
                        : '1.5px solid var(--color-border)',
                      background: soundSet === set ? 'var(--color-accent-dim)' : 'transparent',
                      color: soundSet === set ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      fontSize: '13px',
                      fontWeight: soundSet === set ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {SOUND_SET_LABELS[set]}
                  </button>
                ))}
              </div>
            </div>
          </>}

          {/* ── Fond sonore ──────────────────────────────────────────────── */}
          <GroupHeader open={openDrone} onToggle={() => setOpenDrone((v) => !v)}>
            Fond sonore
          </GroupHeader>

          {openDrone && <>
            <SettingRow
              label="Fond respiratoire"
              hint="Monte à l'inspiration, descend à l'expiration"
            >
              <Toggle value={droneEnabled} onChange={setDroneEnabled} />
            </SettingRow>

            <SliderRow
              label="Volume"
              value={droneVolume}
              onChange={setDroneVolume}
              min={0} max={1} step={0.05}
              disabled={!droneEnabled}
              iconLeft={<VolumeX size={13} className="text-text-muted" />}
              iconRight={<Volume2 size={13} className="text-text-muted" />}
            />
          </>}

          {/* ── Guidage vocal ─────────────────────────────────────────────── */}
          <GroupHeader open={openVoice} onToggle={() => setOpenVoice((v) => !v)}>
            Guidage vocal
          </GroupHeader>

          {openVoice && <>
            <SettingRow
              label="Voix méditatives"
              hint="Annonce chaque phase à voix douce"
            >
              <Toggle value={voiceEnabled} onChange={setVoiceEnabled} />
            </SettingRow>

            <SliderRow
              label="Volume"
              value={voiceVolume}
              onChange={setVoiceVolume}
              min={0} max={1} step={0.05}
              disabled={!voiceEnabled}
              iconLeft={<VolumeX size={13} className="text-text-muted" />}
              iconRight={<Volume2 size={13} className="text-text-muted" />}
            />

            <SliderRow
              label="Débit"
              hint={voiceRate <= 0.6 ? 'Très lent' : voiceRate <= 0.85 ? 'Lent' : 'Normal'}
              value={voiceRate}
              onChange={setVoiceRate}
              min={0.5} max={1.0} step={0.05}
              disabled={!voiceEnabled}
            />
          </>}

        </div>
      </section>

      <p className="pt-2 text-center text-xs text-text-muted">v{version}</p>

    </PageContainer>
  )
}
