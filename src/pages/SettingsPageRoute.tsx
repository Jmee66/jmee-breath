import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogIn, LogOut, User, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { useSoundStore, useVoiceGuideStore, useRiverStore } from '@modules/breath-engine'
import { Volume2, VolumeX } from 'lucide-react'
import { useAuthStore } from '@modules/auth/store/authStore'
import { signOut } from '@modules/auth/services/authService'
import { syncManager } from '@core/sync'
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

// ── Page ─────────────────────────────────────────────────────────────────────

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export default function SettingsPageRoute() {
  const navigate = useNavigate()
  const user     = useAuthStore((s) => s.user)

  // Sync forcée
  const [syncStatus,  setSyncStatus]  = useState<SyncStatus>('idle')
  const [syncResult,  setSyncResult]  = useState<{ pushed: number; pulled: number } | null>(null)

  const handleForceSync = async () => {
    setSyncStatus('syncing')
    setSyncResult(null)
    try {
      const result = await syncManager.forceSync()
      setSyncResult(result)
      setSyncStatus('success')
    } catch {
      setSyncStatus('error')
    } finally {
      setTimeout(() => setSyncStatus('idle'), 4000)
    }
  }

  // Sections ouvertes/fermées
  const [openPhase, setOpenPhase]   = useState(false)
  const [openRiver, setOpenRiver]   = useState(false)
  const [openVoice, setOpenVoice]   = useState(false)

  // Sons de phases
  const soundEnabled    = useSoundStore((s) => s.soundEnabled)
  const soundVolume     = useSoundStore((s) => s.soundVolume)
  const bowlOnPhase     = useSoundStore((s) => s.bowlOnPhase)
  const setSoundEnabled = useSoundStore((s) => s.setSoundEnabled)
  const setSoundVolume  = useSoundStore((s) => s.setSoundVolume)
  const setBowlOnPhase  = useSoundStore((s) => s.setBowlOnPhase)

  // Rivière
  const riverEnabled    = useRiverStore((s) => s.riverEnabled)
  const riverVolume     = useRiverStore((s) => s.riverVolume)
  const setRiverEnabled = useRiverStore((s) => s.setRiverEnabled)
  const setRiverVolume  = useRiverStore((s) => s.setRiverVolume)

  // Guidage vocal
  const voiceEnabled    = useVoiceGuideStore((s) => s.voiceEnabled)
  const voiceVolume     = useVoiceGuideStore((s) => s.voiceVolume)
  const voiceRate       = useVoiceGuideStore((s) => s.voiceRate)
  const voicePitch      = useVoiceGuideStore((s) => s.voicePitch)
  const setVoiceEnabled = useVoiceGuideStore((s) => s.setVoiceEnabled)
  const setVoiceVolume  = useVoiceGuideStore((s) => s.setVoiceVolume)
  const setVoiceRate    = useVoiceGuideStore((s) => s.setVoiceRate)
  const setVoicePitch   = useVoiceGuideStore((s) => s.setVoicePitch)

  return (
    <PageContainer title="Réglages">

      {/* ── Compte ──────────────────────────────────────────────────────────── */}
      <section className="mb-4">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Compte
        </h2>
        {user ? (
          <div className="card divide-y divide-border overflow-hidden p-0">
            <div className="flex items-center gap-3 px-4 py-3">
              <User size={15} className="text-accent shrink-0" />
              <p className="text-sm text-text-primary truncate flex-1">{user.email}</p>
              <span className="text-[10px] text-status-success font-medium">Sync actif</span>
            </div>

            {/* Sync forcée */}
            <button
              onClick={() => void handleForceSync()}
              disabled={syncStatus === 'syncing'}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw size={15} className="animate-spin text-accent" />
              ) : syncStatus === 'success' ? (
                <CheckCircle2 size={15} className="text-status-success" />
              ) : syncStatus === 'error' ? (
                <AlertCircle size={15} className="text-status-error" />
              ) : (
                <RefreshCw size={15} />
              )}
              <span className="flex-1 text-left">
                {syncStatus === 'syncing' && 'Synchronisation…'}
                {syncStatus === 'success' && syncResult && `Sync OK · ${syncResult.pushed} envoyés · ${syncResult.pulled} reçus`}
                {syncStatus === 'error' && 'Erreur — réessayez'}
                {syncStatus === 'idle' && 'Forcer la synchronisation'}
              </span>
            </button>

            <button
              onClick={() => void signOut()}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-status-error hover:bg-bg-elevated transition-colors"
            >
              <LogOut size={15} />
              Se déconnecter
            </button>
          </div>
        ) : (
          <div className="card divide-y divide-border overflow-hidden p-0">
            <button
              onClick={() => navigate('/login')}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-accent hover:bg-bg-elevated transition-colors"
            >
              <LogIn size={15} />
              Se connecter
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-bg-elevated transition-colors"
            >
              <User size={15} />
              Créer un compte
            </button>
          </div>
        )}
      </section>

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
              label="Sons de phase"
              hint="Bol tibétain + accords harmoniques par phase"
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

            <SettingRow
              label="Bong à chaque phase"
              hint="Bong bol tibétain léger à chaque changement de phase"
            >
              <Toggle value={bowlOnPhase} onChange={setBowlOnPhase} />
            </SettingRow>
          </>}

          {/* ── Rivière ──────────────────────────────────────────────────── */}
          <GroupHeader open={openRiver} onToggle={() => setOpenRiver((v) => !v)}>
            Rivière
          </GroupHeader>

          {openRiver && <>
            <SettingRow
              label="Son de rivière"
              hint="Bruit de fond naturel et apaisant"
            >
              <Toggle value={riverEnabled} onChange={setRiverEnabled} />
            </SettingRow>

            <SliderRow
              label="Volume"
              value={riverVolume}
              onChange={setRiverVolume}
              min={0} max={1} step={0.05}
              disabled={!riverEnabled}
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
              label="Guidage vocal"
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

            <SliderRow
              label="Tonalité"
              hint={voicePitch <= 0.7 ? 'Grave' : voicePitch <= 1.1 ? 'Naturelle' : 'Aiguë'}
              value={voicePitch}
              onChange={setVoicePitch}
              min={0.5} max={1.5} step={0.05}
              disabled={!voiceEnabled}
            />
          </>}

        </div>
      </section>

      <p className="pt-2 text-center text-xs text-text-muted">v{version}</p>

    </PageContainer>
  )
}
