import { PageContainer } from '@modules/theme'
import { useSoundStore, useVoiceGuideStore } from '@modules/breath-engine'
import type { SoundSet } from '@modules/breath-engine'
import { Volume2, VolumeX } from 'lucide-react'
import { version } from '../../package.json'

// ── Helpers UI ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
      {children}
    </h2>
  )
}

function SettingRow({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
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
    <div className={`px-4 py-3.5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        {iconLeft}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1"
          style={{ accentColor: 'var(--color-accent)' }}
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
  // Sons de phases
  const soundEnabled    = useSoundStore((s) => s.soundEnabled)
  const soundVolume     = useSoundStore((s) => s.soundVolume)
  const soundSet        = useSoundStore((s) => s.soundSet)
  const setSoundEnabled = useSoundStore((s) => s.setSoundEnabled)
  const setSoundVolume  = useSoundStore((s) => s.setSoundVolume)
  const setSoundSet     = useSoundStore((s) => s.setSoundSet)

  // Guidage vocal
  const voiceEnabled    = useVoiceGuideStore((s) => s.voiceEnabled)
  const voiceVolume     = useVoiceGuideStore((s) => s.voiceVolume)
  const voiceRate       = useVoiceGuideStore((s) => s.voiceRate)
  const setVoiceEnabled = useVoiceGuideStore((s) => s.setVoiceEnabled)
  const setVoiceVolume  = useVoiceGuideStore((s) => s.setVoiceVolume)
  const setVoiceRate    = useVoiceGuideStore((s) => s.setVoiceRate)

  return (
    <PageContainer title="Réglages">

      {/* ── Sons de phases ── */}
      <section>
        <SectionTitle>Son</SectionTitle>
        <div className="card divide-y divide-border overflow-hidden p-0">

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

          <div className={`px-4 py-3.5 ${!soundEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <p className="mb-2.5 text-sm font-medium text-text-primary">Timbre</p>
            <div className="flex gap-2">
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

        </div>
      </section>

      {/* ── Guidage vocal ── */}
      <section>
        <SectionTitle>Guidage vocal</SectionTitle>
        <div className="card divide-y divide-border overflow-hidden p-0">

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

        </div>
      </section>

      <p className="pt-2 text-center text-xs text-text-muted">v{version}</p>

    </PageContainer>
  )
}
