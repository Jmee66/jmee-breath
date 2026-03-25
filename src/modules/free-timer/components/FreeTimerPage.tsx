/**
 * FreeTimerPage — chronomètre d'apnée et chronomètre libre.
 *
 * Modes :
 *  · apnea  : échauffement paramétrable + enregistrement de spasmes diaphragmatiques
 *  · free   : démarrage immédiat + enregistrement de laps
 *
 * Phases :
 *  · idle     : sélection du mode et configuration
 *  · warmup   : compte à rebours (mode apnea uniquement)
 *  · running  : chrono en cours
 *  · finished : résultats + sauvegarde automatique
 *
 * Timing wall-clock (Date.now()) — aucune dérive rAF/setInterval.
 * Sauvegarde automatique dans Dexie `freeTimerSessions` à l'arrêt.
 * Personal Best persisté dans localStorage, éditable manuellement.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Square, RotateCcw, Wind, CheckCircle2, SkipForward, Pencil, Check, Flag, Volume2, VolumeX, Plus, Trash2 } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { useVoiceGuideStore, useSoundStore, useRiverStore, useDroneStore, BreathCircle, useBreathStore, BreathClock } from '@modules/breath-engine'
import { BreathVoiceGuide, estimatePreparationDuration } from '@modules/breath-engine/voice/BreathVoiceGuide'
import { saveFreeTimerSession, getBestFreeTimerSession } from '../services/freeTimerWriter'
import { getAllCustomWarmups, saveCustomWarmup, deleteCustomWarmup } from '../services/customWarmupWriter'
import { CustomWarmupEditor } from './CustomWarmupEditor'
import { useNoSleep } from '@utils/useNoSleep'
import type { FreeTimerSession } from '@core/types'
import type { Exercise, Phase } from '@core/types'
import type { WarmupStep, WarmupProtocol, WarmupDisplay, WarmupBreathPattern, WarmupStepType, CustomWarmup } from '../types'

// ── Types locaux ───────────────────────────────────────────────────────────────

type TimerPhase = 'idle' | 'warmup' | 'running' | 'recovery' | 'finished'
type TimerMode  = 'apnea' | 'free'

interface RecoveryStep {
  pattern:     WarmupBreathPattern
  durationS:   number
  instruction: string
}

// ── Formatters ────────────────────────────────────────────────────────────────

/** MM:SS.d  (dixièmes de seconde) */
function formatChrono(ms: number): string {
  const totalS = Math.floor(ms / 1000)
  const m      = Math.floor(totalS / 60)
  const s      = totalS % 60
  const tenth  = Math.floor((ms % 1000) / 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenth}`
}


/** M:SS court pour les badges */
function formatShort(ms: number): string {
  const totalS = Math.floor(ms / 1000)
  const m = Math.floor(totalS / 60)
  const s = totalS % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Intervalle entre deux timestamps consécutifs */
function intervalLabel(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `+${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `+${m}min` : `+${m}m${r}s`
}

/** Parse MM:SS ou secondes → secondes (null si invalide) */
function parsePbInput(str: string): number | null {
  const trimmed = str.trim()
  const mmss = trimmed.match(/^(\d{1,2}):(\d{1,2})$/)
  if (mmss) {
    const secs = parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10)
    return secs > 0 ? secs : null
  }
  const n = parseFloat(trimmed.replace(',', '.'))
  return !isNaN(n) && n > 0 ? n : null
}

// ── Warm-up presets ───────────────────────────────────────────────────────────

const WARMUP_PRESETS = [
  { label: '1 min',  value: 60   },
  { label: '2 min',  value: 120  },
  { label: '3 min',  value: 180  },
  { label: '5 min',  value: 300  },
  { label: '15 min', value: 900  },
  { label: '20 min', value: 1200 },
]

// ── Warmup protocols ──────────────────────────────────────────────────────────

const WARMUP_PROTOCOLS: Record<number, WarmupProtocol> = {
  60: { name: '1 MIN', steps: [
    { durationS: 40, type: 'breathe', pattern: 'soupir-cyclique', phaseName: 'Phase 1',  instruction: 'Soupir Cyclique : Inspir · Inspir · Soupir lent' },
    { durationS: 6,  type: 'inhale',  pattern: 'inhale',          phaseName: 'Phase 2',  instruction: 'Inspiration lente : Ventre · Côtes · Thorax' },
    { durationS: 6,  type: 'exhale',  pattern: 'exhale',          phaseName: 'Phase 2',  instruction: 'Expiration douce : Thorax · Côtes · Ventre' },
    { durationS: 8,  type: 'hold',    pattern: 'countdown',       phaseName: 'Compte',   instruction: 'Retiens · Apnée dans...' },
    { durationS: 2,  type: 'go',      pattern: 'go',              phaseName: '',         instruction: 'APNÉE — GO !' },
  ]},
  120: { name: 'LE FLASH', steps: [
    { durationS: 100, type: 'breathe', pattern: '6-6-12',     phaseName: 'Phase 1',         instruction: 'Respiration 6-6-12 : Focus Lenteur' },
    { durationS: 10,  type: 'exhale',  pattern: 'exhale',     phaseName: 'Zoom',            instruction: 'Expirez tout l\'air résiduel (Vider les poumons)' },
    { durationS: 10,  type: 'inhale',  pattern: 'inhale',     phaseName: 'Zoom',            instruction: 'Grande Inspiration Finale par paliers' },
    { durationS: 2,   type: 'go',      pattern: 'go',         phaseName: '',                instruction: 'APNÉE — GO !' },
  ]},
  180: { name: "L'ÉVEIL", steps: [
    { durationS: 60, type: 'breathe',  pattern: '6-6-12',     phaseName: 'Détente',    instruction: 'Détente 6-6-12 · Calme le système nerveux' },
    { durationS: 30, type: 'hold',     pattern: 'hold-empty', phaseName: 'Rate',       instruction: 'Apnée Poumons Vides · Réveille la Rate (30s)' },
    { durationS: 60, type: 'recovery', pattern: 'soupir',     phaseName: 'Récup',      instruction: 'Récupération Calme' },
    { durationS: 10, type: 'inhale',   pattern: 'inhale',     phaseName: 'Final',      instruction: 'Ocean Breath léger · Inspiration (10s)' },
    { durationS: 10, type: 'hold',     pattern: 'hold-full',  phaseName: 'Final',      instruction: 'Expiration passive · Blocage plein (10s)' },
    { durationS: 2,  type: 'go',       pattern: 'go',         phaseName: '',           instruction: 'APNÉE — GO !' },
  ]},
  300: { name: 'LE STANDARD', steps: [
    { durationS: 120, type: 'breathe',  pattern: '6-6-12',     phaseName: 'Phase 1 · Détente', instruction: 'Respiration 6-6-12 : Baisse Tension' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',    instruction: 'Apnée Poumons Vides (FRC) — Cycle 1' },
    { durationS: 30,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',    instruction: 'Récupération' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',    instruction: 'Apnée Poumons Vides (FRC) — Cycle 2' },
    { durationS: 30,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',    instruction: 'Récupération' },
    { durationS: 40,  type: 'co2',      pattern: 'co2',        phaseName: 'Phase 3 · CO₂',     instruction: 'Ratio 4-8-16-4 : Ocean Breath' },
    { durationS: 5,   type: 'inhale',   pattern: 'inhale',     phaseName: 'Phase 4 · Zoom',    instruction: 'Inspir : Ventre' },
    { durationS: 5,   type: 'inhale',   pattern: 'inhale',     phaseName: 'Phase 4 · Zoom',    instruction: 'Inspir : Côtes' },
    { durationS: 5,   type: 'inhale',   pattern: 'inhale',     phaseName: 'Phase 4 · Zoom',    instruction: 'Inspir : Clavicules' },
    { durationS: 5,   type: 'hold',     pattern: 'hold-full',  phaseName: 'Phase 4 · Zoom',    instruction: 'Immobilité Totale (Corps Mou)' },
    { durationS: 2,   type: 'go',       pattern: 'go',         phaseName: '',                  instruction: 'APNÉE — GO !' },
  ]},
  900: { name: 'LE PERFORMANCE', steps: [
    { durationS: 300, type: 'breathe',  pattern: '6-6-12',     phaseName: 'Phase 1 · Zen',     instruction: 'Respiration 6-6-12 : Cohérence Cardiaque' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',    instruction: 'Apnée Poumons Vides (FRC) — Cycle 1' },
    { durationS: 60,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',    instruction: 'Récupération Calme' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',    instruction: 'Apnée Poumons Vides (FRC) — Cycle 2' },
    { durationS: 60,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',    instruction: 'Récupération Calme' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',    instruction: 'Apnée Poumons Vides (FRC) — Cycle 3' },
    { durationS: 60,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',    instruction: 'Récupération Calme' },
    { durationS: 290, type: 'co2',      pattern: 'co2',        phaseName: 'Phase 3 · CO₂',     instruction: 'Ratio 4-8-16-4 : Musculation CO₂' },
    { durationS: 16,  type: 'exhale',   pattern: 'exhale',     phaseName: 'Phase 4 · Zoom',    instruction: 'Dernière Expiration Ocean Breath' },
    { durationS: 4,   type: 'hold',     pattern: 'hold-full',  phaseName: 'Phase 4 · Zoom',    instruction: 'Inspiration Éclair — Blocage' },
    { durationS: 2,   type: 'go',       pattern: 'go',         phaseName: '',                  instruction: 'APNÉE — GO !' },
  ]},
  1200: { name: "L'IDÉAL", steps: [
    { durationS: 420, type: 'breathe',  pattern: '6-6-12',     phaseName: 'Phase 1 · Profonde', instruction: 'Zen Absolu : Sommeil Éveillé' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',     instruction: 'Apnée Poumons Vides (FRC) — Cycle 1' },
    { durationS: 60,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',     instruction: 'Récupération Calme' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',     instruction: 'Apnée Poumons Vides (FRC) — Cycle 2' },
    { durationS: 60,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',     instruction: 'Récupération Calme' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',     instruction: 'Apnée Poumons Vides (FRC) — Cycle 3' },
    { durationS: 60,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',     instruction: 'Récupération Calme' },
    { durationS: 30,  type: 'hold',     pattern: 'hold-empty', phaseName: 'Phase 2 · Rate',     instruction: 'Apnée Poumons Vides (FRC) — Cycle 4' },
    { durationS: 60,  type: 'recovery', pattern: 'soupir',     phaseName: 'Phase 2 · Rate',     instruction: 'Récupération Calme' },
    { durationS: 400, type: 'co2',      pattern: 'co2',        phaseName: 'Phase 3 · CO₂',      instruction: 'Ratio 4-8-16-4 : Intensif Ocean Breath' },
    { durationS: 10,  type: 'exhale',   pattern: 'exhale',     phaseName: 'Phase 4 · Zoom',     instruction: 'Videz tout l\'air (Expulsion contrôlée)' },
    { durationS: 10,  type: 'inhale',   pattern: 'inhale',     phaseName: 'Phase 4 · Zoom',     instruction: 'Remplissage par étages (Ventre · Côtes · Haut)' },
    { durationS: 2,   type: 'go',       pattern: 'go',         phaseName: '',                   instruction: 'APNÉE — GO !' },
  ]},
}

// ── Warmup step visuals ───────────────────────────────────────────────────────

const STEP_VISUAL: Record<WarmupStepType, { color: string; label: string }> = {
  breathe:  { color: '#2dd4bf', label: 'Respiration' },
  hold:     { color: '#818cf8', label: 'Rétention' },
  recovery: { color: '#4ade80', label: 'Récupération' },
  inhale:   { color: '#a78bfa', label: 'Inspiration' },
  exhale:   { color: '#34d399', label: 'Expiration' },
  co2:      { color: '#fb923c', label: 'CO₂' },
  go:       { color: '#f43f5e', label: 'GO !' },
}

// ── Warmup BreathEngine helpers ───────────────────────────────────────────────

/** Convertit un pattern en tableau de phases Exercise. */
function patternToPhases(pattern: WarmupBreathPattern, durationS: number): Phase[] {
  switch (pattern) {
    case 'soupir':
      return [
        { type: 'inhale', durationSeconds: 3 },
        { type: 'exhale', durationSeconds: 7 },
      ]
    case 'soupir-cyclique':
      // 4s inspir + 2s inspir rapide + 6s rétention + 12s expiration = 24s cycle
      return [
        { type: 'inhale', durationSeconds: 4,  label: 'Inspir lent' },
        { type: 'inhale', durationSeconds: 2,  label: 'Inspir rapide' },
        { type: 'hold',   durationSeconds: 6,  label: 'Rétention' },
        { type: 'exhale', durationSeconds: 12, label: 'Expiration' },
      ]
    case '6-6-12':
      return [
        { type: 'inhale', durationSeconds: 6 },
        { type: 'hold',   durationSeconds: 6 },
        { type: 'exhale', durationSeconds: 12 },
      ]
    case 'co2':
      return [
        { type: 'inhale',   durationSeconds: 4  },
        { type: 'hold',     durationSeconds: 8  },
        { type: 'exhale',   durationSeconds: 16 },
        { type: 'recovery', durationSeconds: 4  },
      ]
    case 'inhale':
      return [{ type: 'inhale', durationSeconds: durationS }]
    case 'exhale':
      return [{ type: 'exhale', durationSeconds: durationS }]
    case 'hold-full':
      return [{ type: 'hold', durationSeconds: durationS }]
    case 'hold-empty':
      return [{ type: 'hold', durationSeconds: durationS }]
    case 'countdown':
      return [{ type: 'hold', durationSeconds: durationS }]
    case 'go':
      return [{ type: 'hold', durationSeconds: 2 }]
    default:
      return [{ type: 'inhale', durationSeconds: 4 }]
  }
}

/** Construit un Exercise minimal à partir d'un WarmupStep pour le BreathClock. */
function patternToExercise(step: WarmupStep): Exercise {
  const phases  = patternToPhases(step.pattern, step.durationS)
  const cycleS  = phases.reduce((s, p) => s + p.durationSeconds, 0)
  const isLoop  = ['soupir', 'soupir-cyclique', '6-6-12', 'co2'].includes(step.pattern)
  const reps    = isLoop ? Math.max(1, Math.ceil(step.durationS / cycleS) + 1) : 1
  return {
    id:                     `warmup-${step.pattern}`,
    name:                   step.instruction,
    description:            '',
    category:               'preparation',
    difficulty:             1,
    tags:                   [],
    phases,
    repetitions:            reps,
    restBetweenRepsSeconds: 0,
    isPreset:               true,
    createdAt:              '',
    updatedAt:              '',
    customPresets:          [],
  }
}

// ── Personal Best storage ─────────────────────────────────────────────────────

const PB_KEY   = 'apnea_freeTimer_pb_seconds'
const BASE_KEY = 'apnea_freeTimer_base_seconds'

function loadPb(): number | null {
  try {
    const v = localStorage.getItem(PB_KEY)
    return v ? parseFloat(v) : null
  } catch { return null }
}

function savePbToStorage(secs: number | null) {
  try {
    if (secs != null) localStorage.setItem(PB_KEY, String(secs))
    else localStorage.removeItem(PB_KEY)
  } catch { /* ignore */ }
}

function loadBase(): number | null {
  try {
    const v = localStorage.getItem(BASE_KEY)
    return v ? parseFloat(v) : null
  } catch { return null }
}

function saveBaseToStorage(secs: number | null) {
  try {
    if (secs != null) localStorage.setItem(BASE_KEY, String(secs))
    else localStorage.removeItem(BASE_KEY)
  } catch { /* ignore */ }
}

// ── Best Session widget ───────────────────────────────────────────────────────

function BestSession({ seconds }: { seconds: number | null }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
        Best session
      </span>
      <span className="text-sm font-mono text-white/70 tabular-nums">
        {seconds != null ? formatShort(seconds * 1000) : '--:--'}
      </span>
    </div>
  )
}

// ── Personal Best widget ──────────────────────────────────────────────────────

function PersonalBest({
  pbSeconds,
  onChange,
}: {
  pbSeconds: number | null
  onChange:  (secs: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [raw,     setRaw]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const openEdit = () => {
    setRaw(pbSeconds != null ? formatShort(pbSeconds * 1000) : '')
    setEditing(true)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
  }

  const commit = (str: string) => {
    const secs = parsePbInput(str)
    if (secs != null) onChange(secs)
    else if (str.trim() === '' || str.trim() === '0') onChange(null)
    setEditing(false)
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
        Personal best
      </span>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="M:SS"
            className="w-16 text-right text-sm font-mono bg-bg-elevated border border-accent/60 rounded-lg px-2 py-0.5 text-text-primary outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button onMouseDown={(e) => { e.preventDefault(); commit(raw) }} className="text-accent/80 hover:text-accent">
            <Check size={13} />
          </button>
        </div>
      ) : (
        <button onClick={openEdit} className="flex items-center gap-1.5 group">
          <span className="text-sm font-mono text-accent group-hover:text-accent/80 tabular-nums">
            {pbSeconds != null ? formatShort(pbSeconds * 1000) : '--:--'}
          </span>
          <Pencil size={11} className="text-white/30 group-hover:text-white/60" />
        </button>
      )}
    </div>
  )
}

// ── Apnée Base Setup widget ───────────────────────────────────────────────────

function ApneaBaseSetup({
  baseSeconds,
  onChange,
}: {
  baseSeconds: number | null
  onChange:    (secs: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [raw,     setRaw]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const openEdit = () => {
    setRaw(baseSeconds != null ? formatShort(baseSeconds * 1000) : '')
    setEditing(true)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
  }

  const commit = (str: string) => {
    const secs = parsePbInput(str)
    if (secs != null) onChange(secs)
    else if (str.trim() === '' || str.trim() === '0') onChange(null)
    setEditing(false)
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
        Base setup
      </span>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="M:SS"
            className="w-16 text-right text-sm font-mono bg-bg-elevated border border-white/30 rounded-lg px-2 py-0.5 text-text-primary outline-none focus:border-white/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button onMouseDown={(e) => { e.preventDefault(); commit(raw) }} className="text-white/50 hover:text-white/80">
            <Check size={13} />
          </button>
        </div>
      ) : (
        <button onClick={openEdit} className="flex items-center gap-1.5 group">
          <span className="text-sm font-mono text-white/70 group-hover:text-white/90 tabular-nums">
            {baseSeconds != null ? formatShort(baseSeconds * 1000) : '--:--'}
          </span>
          <Pencil size={11} className="text-white/30 group-hover:text-white/60" />
        </button>
      )}
    </div>
  )
}

// ── Bouton son (header) ───────────────────────────────────────────────────────

function TimerSoundButton() {
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

  return (
    <div style={{ position: 'relative' }}>
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

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          />
          <div style={{
            position: 'absolute', top: '44px', right: 0, zIndex: 50,
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
      )}
    </div>
  )
}

function SoundRow({ label, enabled, volume, onToggle, onVolume }: {
  label: string; enabled: boolean; volume: number
  onToggle: () => void; onVolume: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</span>
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
            width: '14px', height: '14px', borderRadius: '50%', background: 'white', transition: 'left 0.2s',
          }} />
        </button>
      </div>
      <input type="range" min={0} max={1} step={0.05} value={volume}
        onChange={(e) => onVolume(parseFloat(e.target.value))} disabled={!enabled}
        style={{ width: '100%', accentColor: 'var(--color-accent)', opacity: enabled ? 1 : 0.3, cursor: enabled ? 'pointer' : 'default' }}
      />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FreeTimerPage() {
  const [phase,          setPhase]          = useState<TimerPhase>('idle')
  const [mode,           setMode]           = useState<TimerMode>('apnea')
  const [displayMs,      setDisplayMs]      = useState(0)
  const [warmupDisplay,  setWarmupDisplay]  = useState<WarmupDisplay | null>(null)
  const [warmupSeconds,  setWarmupSeconds]  = useState(120)
  const [lapsMs,         setLapsMs]         = useState<number[]>([])
  const [lapFlash,       setLapFlash]       = useState(false)
  const [savedSession,   setSavedSession]   = useState<FreeTimerSession | null>(null)
  const [isSaving,       setIsSaving]       = useState(false)
  const [pbSeconds,          setPbSeconds]          = useState<number | null>(loadPb)
  const [baseSeconds,        setBaseSeconds]        = useState<number | null>(loadBase)
  const [bestSessionSeconds, setBestSessionSeconds] = useState<number | null>(null)
  // Custom warmups
  const [customWarmups,      setCustomWarmups]      = useState<CustomWarmup[]>([])
  const [selectedCustomId,   setSelectedCustomId]   = useState<string | null>(null)
  const [warmupTab,          setWarmupTab]          = useState<'presets' | 'custom'>('presets')
  const [showEditor,         setShowEditor]         = useState(false)
  const [editingWarmup,      setEditingWarmup]      = useState<CustomWarmup | undefined>(undefined)
  // Recovery
  const [recoveryDisplay,    setRecoveryDisplay]    = useState<{ instruction: string; remaining: number; progress: number } | null>(null)

  const handlePbChange = useCallback((secs: number | null) => {
    setPbSeconds(secs)
    savePbToStorage(secs)
  }, [])

  const handleBaseChange = useCallback((secs: number | null) => {
    setBaseSeconds(secs)
    saveBaseToStorage(secs)
  }, [])

  // Refs
  const startWallRef     = useRef<number>(0)
  const startedAtRef     = useRef<string>('')
  const warmupStartMsRef = useRef<number>(0)
  const protocolRef      = useRef<WarmupProtocol | null>(null)
  const lapsRef          = useRef<number[]>([])
  const modeRef          = useRef<TimerMode>('apnea')
  const phaseRef         = useRef<TimerPhase>('idle')
  const rafRef           = useRef<number | null>(null)
  const tickFnRef        = useRef<(() => void) | null>(null)
  const flashTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef       = useRef(true)
  // BreathClock par étape de l'échauffement
  const warmupClockRef    = useRef<BreathClock | null>(null)
  const warmupVoiceRef    = useRef<BreathVoiceGuide | null>(null)
  const lastStepIdxRef    = useRef(-1)
  // Recovery post-apnée
  const activeRecoveryRef     = useRef<RecoveryStep | null>(null)
  const recoveryStartMsRef    = useRef<number>(0)
  const recoveryDurationSRef  = useRef<number>(0)

  // Sync modeRef / phaseRef with state
  useEffect(() => { modeRef.current  = mode  }, [mode])
  useEffect(() => { phaseRef.current = phase }, [phase])

  // ── Restore session after iOS page kill ─────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    getBestFreeTimerSession().then((s) => {
      if (s && mountedRef.current) setBestSessionSeconds(s.durationSeconds)
    })
    getAllCustomWarmups().then((list) => {
      if (mountedRef.current) setCustomWarmups(list)
    })

    // Restore running timer if iOS killed the page while timer was active
    try {
      const raw = sessionStorage.getItem('apnea_running')
      if (raw) {
        const saved = JSON.parse(raw) as { startWallMs: number; startedAt: string; mode: TimerMode }
        const age = Date.now() - saved.startWallMs
        if (age > 0 && age < 3_600_000) {          // max 1 h
          startWallRef.current  = saved.startWallMs
          startedAtRef.current  = saved.startedAt
          modeRef.current       = saved.mode
          lapsRef.current       = []
          setMode(saved.mode)
          setPhase('running')
          phaseRef.current = 'running'
          const tick = () => {
            if (mountedRef.current) {
              setDisplayMs(Date.now() - startWallRef.current)
              rafRef.current = requestAnimationFrame(tick)
            }
          }
          tickFnRef.current = tick
          rafRef.current = requestAnimationFrame(tick)
        } else {
          sessionStorage.removeItem('apnea_running')
        }
      }
    } catch { /* ignore */ }

    return () => {
      mountedRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
      warmupVoiceRef.current?.cancel()
      warmupClockRef.current?.stop()
    }
  }, [])

  // ── Wake Lock + NoSleep — empêche le verrouillage écran ─────────────────────
  const { enable: noSleepEnable, disable: noSleepDisable } = useNoSleep()
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLockRef.current = await (
        navigator as Navigator & { wakeLock: { request(t: string): Promise<WakeLockSentinel> } }
      ).wakeLock.request('screen')
    } catch { /* batterie faible, permission refusée, non supporté */ }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  // ── Relance RAF après déverrouillage écran (iOS suspend RAF) ────────────────
  // Bug : iOS tue le RAF mais NE remet PAS rafRef à null (rafId "fantôme")
  //       → la condition `=== null` échouait → le RAF ne repartait jamais.
  // Fix : on page hidden → annule proprement le RAF + reset à null.
  //       on page visible → annule l'id fantôme éventuel + relance toujours.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Annule proprement le RAF (stoppe la boucle, reset id)
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        return
      }

      // — Page redevient visible —

      // Ré-acquiert le Wake Lock (OS le libère automatiquement au verrouillage)
      const activePhase = phaseRef.current
      if (activePhase === 'running' || activePhase === 'warmup') {
        void requestWakeLock()
      }

      // Relance le RAF : annule l'id fantôme éventuel + toujours restart
      if ((activePhase === 'running' || activePhase === 'warmup') && tickFnRef.current) {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        rafRef.current = requestAnimationFrame(tickFnRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [requestWakeLock])

  const getElapsed = useCallback((): number => {
    return Date.now() - startWallRef.current
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const stopWarmupClock = useCallback(() => {
    warmupVoiceRef.current?.cancel()
    warmupVoiceRef.current = null
    warmupClockRef.current?.stop()
    warmupClockRef.current = null
    useBreathStore.getState().endSession()
  }, [])

  const startWarmupStepClock = useCallback((step: WarmupStep) => {
    if (step.type === 'go') return
    const exercise = patternToExercise(step)
    const snd      = useSoundStore.getState()
    const drn      = useDroneStore.getState()
    const vce      = useVoiceGuideStore.getState()

    const voiceGuide = new BreathVoiceGuide({
      enabled: vce.voiceEnabled,
      volume:  vce.voiceVolume,
      rate:    vce.voiceRate,
      pitch:   vce.voicePitch,
    })
    voiceGuide.setExercise(exercise)
    warmupVoiceRef.current = voiceGuide

    const prepDuration = vce.voiceEnabled
      ? estimatePreparationDuration(exercise, vce.voiceRate)
      : 3

    const clock = new BreathClock(
      {
        onPhaseChange: (phase) => {
          voiceGuide.speak(phase.internalType)
          useBreathStore.getState().setPhaseComplete(
            phase.publicType,
            phase.internalType,
            phase.durationSeconds,
          )
        },
        onTick: (progress, remaining) => {
          useBreathStore.getState().setProgress(progress)
          useBreathStore.getState().setRemaining(remaining)
        },
        onRepComplete: () => {},
        onSessionComplete: () => {},
      },
      {
        enabled:    snd.soundEnabled,
        volume:     snd.soundVolume,
        soundSet:   snd.soundSet,
        bowlOnPhase: snd.bowlOnPhase,
      },
      {
        enabled: drn.droneEnabled,
        volume:  drn.droneVolume,
      },
    )
    warmupClockRef.current = clock
    void clock.start(exercise, prepDuration)
  }, [])

  const startTimer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    stopWarmupClock()
    lastStepIdxRef.current = -1
    useBreathStore.getState().endSession()
    startWallRef.current = Date.now()
    startedAtRef.current = new Date().toISOString()
    lapsRef.current      = []
    setLapsMs([])
    setDisplayMs(0)
    setSavedSession(null)
    setPhase('running')

    const tick = () => {
      if (mountedRef.current) {
        setDisplayMs(Date.now() - startWallRef.current)
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    tickFnRef.current = tick
    rafRef.current = requestAnimationFrame(tick)

    // Wake Lock (Android/desktop) + NoSleep vidéo silencieuse (iOS)
    void requestWakeLock()
    noSleepEnable()

    // Persistance sessionStorage — survie au kill iOS
    try {
      sessionStorage.setItem('apnea_running', JSON.stringify({
        startWallMs: startWallRef.current,
        startedAt:   startedAtRef.current,
        mode:        modeRef.current,
      }))
    } catch { /* ignore */ }
  }, [requestWakeLock, stopWarmupClock])

  const startWarmup = useCallback((protocol: WarmupProtocol) => {
    if (!protocol) { startTimer(); return }

    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }

    // Déverrouille speechSynthesis sur iOS (doit être appelé depuis un geste utilisateur)
    if ('speechSynthesis' in window) {
      try {
        const unlock = new SpeechSynthesisUtterance('')
        unlock.volume = 0
        window.speechSynthesis.speak(unlock)
      } catch { /* ignore */ }
    }

    stopWarmupClock()
    lastStepIdxRef.current   = -1

    protocolRef.current      = protocol
    warmupStartMsRef.current = Date.now()
    setSavedSession(null)
    setPhase('warmup')

    const totalS = protocol.steps.reduce((s, step) => s + step.durationS, 0)

    const tick = () => {
      if (!mountedRef.current) return
      const elapsedS = (Date.now() - warmupStartMsRef.current) / 1000
      if (elapsedS >= totalS) { startTimer(); return }

      let acc       = 0
      let stepIndex = 0
      for (const step of protocol.steps) {
        if (elapsedS < acc + step.durationS) {
          const stepElapsedS  = elapsedS - acc
          const stepRemaining = Math.ceil(step.durationS - stepElapsedS)

          // Nouvelle étape détectée → démarre un nouveau BreathClock
          if (stepIndex !== lastStepIdxRef.current) {
            lastStepIdxRef.current = stepIndex
            stopWarmupClock()
            startWarmupStepClock(step)
          }

          setWarmupDisplay({
            protocolName:  protocol.name,
            phaseName:     step.phaseName,
            instruction:   step.instruction,
            stepRemaining,
            stepProgress:  stepElapsedS / step.durationS,
            totalProgress: elapsedS / totalS,
            type:          step.type,
            isGo:          step.type === 'go',
          })
          break
        }
        acc += step.durationS
        stepIndex++
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    tickFnRef.current = tick
    rafRef.current = requestAnimationFrame(tick)

    // Wake Lock (Android/desktop) + NoSleep vidéo silencieuse (iOS)
    void requestWakeLock()
    noSleepEnable()
  }, [startTimer, stopWarmupClock, startWarmupStepClock, requestWakeLock, noSleepEnable])

  // ── Recovery post-apnée ─────────────────────────────────────────────────────

  const startRecovery = useCallback((rec: RecoveryStep) => {
    activeRecoveryRef.current    = rec
    recoveryStartMsRef.current   = Date.now()
    recoveryDurationSRef.current = rec.durationS

    const recoveryWarmupStep: WarmupStep = {
      durationS:   rec.durationS,
      pattern:     rec.pattern,
      phaseName:   'Récupération',
      instruction: rec.instruction || 'Récupérez calmement',
      type:        'recovery',
    }
    stopWarmupClock()
    startWarmupStepClock(recoveryWarmupStep)

    const tick = () => {
      if (!mountedRef.current) return
      const elapsedS  = (Date.now() - recoveryStartMsRef.current) / 1000
      const remaining = Math.max(0, Math.ceil(rec.durationS - elapsedS))
      const progress  = Math.min(1, elapsedS / rec.durationS)

      setRecoveryDisplay({ instruction: rec.instruction, remaining, progress })

      if (elapsedS >= rec.durationS) {
        stopWarmupClock()
        setRecoveryDisplay(null)
        setPhase('finished')
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    tickFnRef.current = tick
    rafRef.current = requestAnimationFrame(tick)
  }, [stopWarmupClock, startWarmupStepClock])

  const skipRecovery = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    tickFnRef.current = null
    stopWarmupClock()
    setRecoveryDisplay(null)
    setPhase('finished')
  }, [stopWarmupClock])

  const skipWarmupStep = useCallback(() => {
    const protocol = protocolRef.current
    if (!protocol) return
    const elapsedS = (Date.now() - warmupStartMsRef.current) / 1000
    let acc = 0
    for (const step of protocol.steps) {
      if (elapsedS < acc + step.durationS) {
        const remaining = (acc + step.durationS) - elapsedS
        warmupStartMsRef.current -= remaining * 1000
        // Force re-detection du nouveau step dès le prochain tick
        lastStepIdxRef.current = -1
        stopWarmupClock()
        break
      }
      acc += step.durationS
    }
  }, [stopWarmupClock])

  const stopTimer = useCallback(async () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    tickFnRef.current = null
    releaseWakeLock()
    noSleepDisable()
    try { sessionStorage.removeItem('apnea_running') } catch { /* ignore */ }
    const finalMs   = getElapsed()
    const finalMode = modeRef.current
    setDisplayMs(finalMs)
    setIsSaving(true)
    try {
      const session = await saveFreeTimerSession(
        startedAtRef.current,
        finalMs / 1000,
        lapsRef.current.map((ms) => ms / 1000),
        '',
        finalMode,
      )
      if (mountedRef.current) {
        setSavedSession(session)
        const finalS = finalMs / 1000
        setBestSessionSeconds((cur) => (cur === null || finalS > cur ? finalS : cur))
        setPbSeconds((cur) => {
          if (cur === null || finalS > cur) { savePbToStorage(finalS); return finalS }
          return cur
        })
      }
    } finally {
      if (mountedRef.current) setIsSaving(false)
    }

    // Recovery post-apnée si un échauffement custom avec récupération était actif
    const rec = activeRecoveryRef.current
    if (rec && rec.durationS > 0 && mountedRef.current) {
      setPhase('recovery')
      startRecovery(rec)
    } else {
      setPhase('finished')
    }
  }, [getElapsed, releaseWakeLock, noSleepDisable, startRecovery])

  const recordLap = useCallback(() => {
    const t = getElapsed()
    lapsRef.current = [...lapsRef.current, t]
    setLapsMs([...lapsRef.current])

    setLapFlash(true)
    flashTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setLapFlash(false)
    }, 180)
  }, [getElapsed])

  const resetTimer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    tickFnRef.current = null
    releaseWakeLock()
    noSleepDisable()
    try { sessionStorage.removeItem('apnea_running') } catch { /* ignore */ }
    stopWarmupClock()
    lastStepIdxRef.current   = -1
    activeRecoveryRef.current = null
    setRecoveryDisplay(null)
    setDisplayMs(0)
    setLapsMs([])
    setSavedSession(null)
    lapsRef.current = []
    setPhase('idle')
  }, [releaseWakeLock, noSleepDisable, stopWarmupClock])

  // ── Render ──────────────────────────────────────────────────────────────────

  const subtitle = mode === 'apnea' ? 'Apnée statique' : 'Chronomètre libre'

  return (
    <PageContainer title="Timer" subtitle={subtitle} actions={<TimerSoundButton />}>
      {/* Widgets row — toujours visibles */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1.5rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <BestSession seconds={bestSessionSeconds} />
        <PersonalBest pbSeconds={pbSeconds} onChange={handlePbChange} />
        <ApneaBaseSetup baseSeconds={baseSeconds} onChange={handleBaseChange} />
      </div>

      {phase === 'idle' && (
        <IdleView
          mode={mode}
          onModeChange={setMode}
          warmupSeconds={warmupSeconds}
          onWarmupChange={setWarmupSeconds}
          warmupTab={warmupTab}
          onWarmupTabChange={setWarmupTab}
          customWarmups={customWarmups}
          selectedCustomId={selectedCustomId}
          onSelectCustom={setSelectedCustomId}
          onCreateCustom={() => { setEditingWarmup(undefined); setShowEditor(true) }}
          onEditCustom={(w) => { setEditingWarmup(w); setShowEditor(true) }}
          onDeleteCustom={async (id) => {
            await deleteCustomWarmup(id)
            setCustomWarmups((prev) => prev.filter((w) => w.id !== id))
            if (selectedCustomId === id) setSelectedCustomId(null)
          }}
          onStart={() => {
            if (mode === 'apnea') {
              if (warmupTab === 'custom' && selectedCustomId) {
                const cw = customWarmups.find((w) => w.id === selectedCustomId)
                if (cw) {
                  // Mémorise la recovery pour après l'apnée
                  activeRecoveryRef.current = {
                    pattern:     cw.recoveryPattern,
                    durationS:   cw.recoveryDurationS,
                    instruction: cw.recoveryInstruction,
                  }
                  // Construit le protocol en ajoutant la phase GO
                  const protocol: WarmupProtocol = {
                    name:  cw.name,
                    steps: [
                      ...cw.steps,
                      { durationS: cw.goDurationS, type: 'go', pattern: 'go', phaseName: '', instruction: 'APNÉE — GO !' },
                    ],
                  }
                  startWarmup(protocol)
                  return
                }
              }
              // Preset
              activeRecoveryRef.current = null
              const protocol = WARMUP_PROTOCOLS[warmupSeconds]
              if (protocol) startWarmup(protocol)
              else startTimer()
            } else {
              activeRecoveryRef.current = null
              startTimer()
            }
          }}
        />
      )}
      {phase === 'warmup' && (
        <WarmupView
          display={warmupDisplay}
          onSkipStep={skipWarmupStep}
          onSkipAll={startTimer}
          onCancel={resetTimer}
        />
      )}
      {phase === 'running' && (
        <RunningView
          mode={mode}
          displayMs={displayMs}
          lapsMs={lapsMs}
          lapFlash={lapFlash}
          onLap={recordLap}
          onStop={stopTimer}
        />
      )}
      {phase === 'recovery' && (
        <RecoveryView
          display={recoveryDisplay}
          onSkip={skipRecovery}
        />
      )}
      {phase === 'finished' && (
        <FinishedView
          mode={mode}
          displayMs={displayMs}
          lapsMs={lapsMs}
          isSaving={isSaving}
          saved={!!savedSession}
          onReset={resetTimer}
        />
      )}

      {/* Éditeur d'échauffement custom — overlay plein écran */}
      {showEditor && (
        <CustomWarmupEditor
          initialWarmup={editingWarmup}
          onCancel={() => setShowEditor(false)}
          onSave={async (data) => {
            const now = new Date().toISOString()
            const warmup: CustomWarmup = {
              id:        editingWarmup?.id ?? crypto.randomUUID(),
              createdAt: editingWarmup?.createdAt ?? now,
              updatedAt: now,
              syncedAt:  null,
              ...data,
            }
            await saveCustomWarmup(warmup)
            setCustomWarmups(await getAllCustomWarmups())
            setSelectedCustomId(warmup.id)
            setWarmupTab('custom')
            setShowEditor(false)
          }}
        />
      )}
    </PageContainer>
  )
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: TimerMode; onChange: (m: TimerMode) => void }) {
  return (
    <div className="flex w-full rounded-xl bg-bg-elevated border border-border overflow-hidden">
      {(['apnea', 'free'] as TimerMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`
            flex-1 py-2.5 text-sm font-medium transition-all
            ${mode === m
              ? 'bg-accent text-text-inverse'
              : 'text-white/60 hover:text-white/90'
            }
          `}
        >
          {m === 'apnea' ? 'Apnée' : 'Libre'}
        </button>
      ))}
    </div>
  )
}

// ── Idle view ─────────────────────────────────────────────────────────────────

function IdleView({
  mode, onModeChange, warmupSeconds, onWarmupChange,
  warmupTab, onWarmupTabChange,
  customWarmups, selectedCustomId, onSelectCustom,
  onCreateCustom, onEditCustom, onDeleteCustom,
  onStart,
}: {
  mode:              TimerMode
  onModeChange:      (m: TimerMode) => void
  warmupSeconds:     number
  onWarmupChange:    (s: number) => void
  warmupTab:         'presets' | 'custom'
  onWarmupTabChange: (t: 'presets' | 'custom') => void
  customWarmups:     CustomWarmup[]
  selectedCustomId:  string | null
  onSelectCustom:    (id: string) => void
  onCreateCustom:    () => void
  onEditCustom:      (w: CustomWarmup) => void
  onDeleteCustom:    (id: string) => Promise<void>
  onStart:           () => void
}) {
  const canStart = mode === 'free'
    || warmupTab === 'presets'
    || (warmupTab === 'custom' && selectedCustomId !== null)

  return (
    <div className="flex flex-col items-center gap-5 pt-4">
      {/* Chrono placeholder */}
      <div className="text-center space-y-1">
        <p className="font-mono text-7xl font-thin tracking-tight text-text-primary select-none">
          00:00.0
        </p>
        <p className="text-xs text-white/60">
          {mode === 'apnea' ? 'Prêt · Inspirez profondément' : 'Prêt · Démarrez quand vous voulez'}
        </p>
      </div>

      {/* Mode toggle */}
      <ModeToggle mode={mode} onChange={onModeChange} />

      {/* Mode-specific config */}
      {mode === 'apnea' ? (
        <>
          {/* Warm-up card avec onglets */}
          <div className="card w-full p-0 overflow-hidden space-y-0">
            {/* Onglets Presets / Mes échauffements */}
            <div className="flex border-b border-border">
              {(['presets', 'custom'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onWarmupTabChange(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                    warmupTab === tab
                      ? 'text-accent border-b-2 border-accent -mb-px'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {tab === 'presets' ? 'Presets' : 'Mes échauffements'}
                </button>
              ))}
            </div>

            <div className="p-4">
              {warmupTab === 'presets' ? (
                <div className="space-y-3">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {WARMUP_PRESETS.map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => onWarmupChange(value)}
                        className={`
                          rounded-xl py-2 text-sm font-medium transition-all active:scale-95
                          ${warmupSeconds === value
                            ? 'bg-accent text-text-inverse'
                            : 'bg-bg-elevated text-white/70 border border-border hover:border-accent/50'
                          }
                        `}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/50 text-center">
                    {WARMUP_PROTOCOLS[warmupSeconds]?.name ?? ''}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customWarmups.length === 0 ? (
                    <p className="text-xs text-white/40 text-center py-2">
                      Aucun échauffement — crée le tien ci-dessous
                    </p>
                  ) : (
                    customWarmups.map((w) => {
                      const totalS = w.steps.reduce((s, step) => s + step.durationS, 0) + w.goDurationS
                      const m = Math.floor(totalS / 60)
                      const s = totalS % 60
                      const durLabel = s === 0 ? `${m} min` : `${m}′${String(s).padStart(2, '0')}`
                      return (
                        <div
                          key={w.id}
                          onClick={() => onSelectCustom(w.id)}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                            selectedCustomId === w.id
                              ? 'bg-accent/15 border border-accent/40'
                              : 'bg-bg-elevated border border-border hover:border-accent/30'
                          }`}
                        >
                          <span className={`flex-1 text-sm font-medium truncate ${
                            selectedCustomId === w.id ? 'text-accent' : 'text-text-primary'
                          }`}>
                            {w.name}
                          </span>
                          <span className="text-xs text-white/40 shrink-0">{durLabel}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditCustom(w) }}
                            className="p-1 text-white/30 hover:text-white/70 transition-colors"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); void onDeleteCustom(w.id) }}
                            className="p-1 text-white/30 hover:text-status-error transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )
                    })
                  )}
                  <button
                    onClick={onCreateCustom}
                    className="flex items-center gap-2 w-full justify-center rounded-xl border border-dashed border-border py-2 text-xs text-white/40 hover:border-accent/50 hover:text-accent transition-colors"
                  >
                    <Plus size={12} />
                    Créer un échauffement
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="card w-full p-4 space-y-2 text-center">
            <p className="text-xs text-white/80 leading-relaxed">
              Appuyez sur <strong className="text-text-primary">Démarrer</strong> puis retenez votre souffle.
            </p>
            <p className="text-xs text-white/60 leading-relaxed">
              Tapez <strong className="text-accent">Spasme</strong> à chaque contraction diaphragmatique.
            </p>
          </div>
        </>
      ) : (
        <div className="card w-full p-4 space-y-2 text-center">
          <p className="text-xs text-white/80 leading-relaxed">
            Démarrage immédiat, sans échauffement.
          </p>
          <p className="text-xs text-white/60 leading-relaxed">
            Tapez <strong className="text-accent">Lap</strong> pour marquer un moment ou une reprise.
          </p>
        </div>
      )}

      <button
        onClick={onStart}
        disabled={!canStart}
        className="flex items-center gap-3 w-full justify-center rounded-2xl bg-accent py-5 text-lg font-semibold text-text-inverse hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Play size={22} />
        {mode === 'apnea' ? "Démarrer l'échauffement" : 'Démarrer'}
      </button>
    </div>
  )
}

// ── Recovery view ─────────────────────────────────────────────────────────────

function RecoveryView({
  display,
  onSkip,
}: {
  display: { instruction: string; remaining: number; progress: number } | null
  onSkip: () => void
}) {
  const rem = display?.remaining ?? 0
  const remLabel = rem >= 60
    ? `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`
    : `${rem}s`

  return (
    <div className="flex flex-col gap-4 pt-8">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399', letterSpacing: '0.03em' }}>
          Récupération
        </span>
      </div>

      <div className="card p-5 text-center" style={{ borderColor: '#34d39930' }}>
        <p style={{ fontSize: '1.15rem', fontWeight: 500, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
          {display?.instruction ?? 'Récupérez calmement'}
        </p>
      </div>

      <div className="flex justify-center py-2">
        <BreathCircle />
      </div>

      <div className="text-center">
        <p style={{ fontFamily: 'monospace', fontSize: '3.5rem', fontWeight: 100, color: '#34d399' }}>
          {remLabel}
        </p>
        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.25rem' }}>
          récupération post-apnée
        </p>
        <div style={{ marginTop: '0.5rem', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: '#34d399', width: `${(display?.progress ?? 0) * 100}%` }} />
        </div>
      </div>

      <button
        onClick={onSkip}
        className="flex items-center gap-2 w-full justify-center rounded-2xl border border-border py-3 text-sm text-white/60 hover:bg-bg-elevated active:scale-95 transition-all"
      >
        Passer la récupération →
      </button>
    </div>
  )
}

// ── Warmup view ───────────────────────────────────────────────────────────────

function WarmupView({
  display,
  onSkipStep,
  onSkipAll,
  onCancel,
}: {
  display:    WarmupDisplay | null
  onSkipStep: () => void
  onSkipAll:  () => void
  onCancel:   () => void
}) {
  if (!display) return null

  // ── GO ! ────────────────────────────────────────────────────────────────────
  if (display.isGo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', minHeight: '60vh', paddingTop: '4rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>
          {display.protocolName}
        </p>
        <p style={{ fontFamily: 'monospace', fontSize: '6rem', fontWeight: 900, color: '#f43f5e', lineHeight: 1, letterSpacing: '0.05em' }}>
          GO !
        </p>
        <p style={{ fontSize: '1.1rem', fontWeight: 500, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Apnée
        </p>
      </div>
    )
  }

  const visual = STEP_VISUAL[display.type]

  // Formatage du compteur de l'étape
  const rem = display.stepRemaining
  const remLabel = rem >= 60
    ? `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`
    : `${rem}s`

  return (
    <div className="flex flex-col gap-4 pt-8">

      {/* En-tête : type d'étape (principal) + protocole/phase (aligné droite) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 700, color: visual.color, letterSpacing: '0.03em' }}>
          {visual.label}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'right', flexShrink: 0 }}>
          {display.protocolName}{display.phaseName ? ` · ${display.phaseName}` : ''}
        </span>
      </div>

      {/* Instruction */}
      <div className="card p-5 text-center" style={{ borderColor: visual.color + '30' }}>
        <p style={{ fontSize: '1.15rem', fontWeight: 500, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
          {display.instruction}
        </p>
      </div>

      {/* Animation cercle de respiration */}
      <div className="flex justify-center py-2">
        <BreathCircle />
      </div>

      {/* Compteur étape */}
      <div className="text-center">
        <p style={{ fontFamily: 'monospace', fontSize: '3.5rem', fontWeight: 100, color: visual.color, tabularNums: true } as React.CSSProperties}>
          {remLabel}
        </p>
        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.25rem' }}>
          temps restant sur cette étape
        </p>
        {/* Barre de progression de l'étape */}
        <div style={{ marginTop: '0.5rem', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '999px', background: visual.color, width: `${display.stepProgress * 100}%` }} />
        </div>
      </div>

      {/* Progression totale */}
      <div>
        <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.3rem' }}>
          Progression totale
        </p>
        <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '999px',
            background: 'rgba(124,58,237,0.6)',
            width: `${display.totalProgress * 100}%`,
            transition: 'width 0.12s linear',
          }} />
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={onSkipStep}
        className="flex items-center justify-center gap-2 w-full rounded-2xl border border-border py-3 text-sm text-white/60 hover:bg-bg-elevated active:scale-95 transition-all"
      >
        Passer cette étape →
      </button>

      <button
        onClick={onSkipAll}
        className="flex items-center gap-2 w-full justify-center rounded-2xl bg-accent py-4 text-base font-semibold text-text-inverse hover:opacity-90 active:scale-95 transition-all"
      >
        <SkipForward size={18} />
        Commencer maintenant
      </button>

      <button
        onClick={onCancel}
        style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', padding: '0.5rem', textAlign: 'center', width: '100%' }}
      >
        Annuler
      </button>
    </div>
  )
}

// ── Running view ──────────────────────────────────────────────────────────────

function RunningView({
  mode,
  displayMs,
  lapsMs,
  lapFlash,
  onLap,
  onStop,
}: {
  mode:      TimerMode
  displayMs: number
  lapsMs:    number[]
  lapFlash:  boolean
  onLap:     () => void
  onStop:    () => Promise<void>
}) {
  const [stopping, setStopping] = useState(false)

  const handleStop = async () => {
    setStopping(true)
    await onStop()
  }

  const isApnea     = mode === 'apnea'
  const lapLabel    = isApnea ? 'Spasme' : 'Lap'
  const lapCount    = lapsMs.length
  const counterText = lapCount === 0
    ? 'En cours…'
    : isApnea
      ? `${lapCount} spasme${lapCount > 1 ? 's' : ''} enregistré${lapCount > 1 ? 's' : ''}`
      : `${lapCount} lap${lapCount > 1 ? 's' : ''} enregistré${lapCount > 1 ? 's' : ''}`

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Chrono */}
      <div className="text-center">
        <p className="font-mono text-7xl font-thin tracking-tight text-text-primary select-none tabular-nums">
          {formatChrono(displayMs)}
        </p>
        <p className="mt-1 text-xs text-white/60">{counterText}</p>
      </div>

      {/* Bouton LAP / SPASME */}
      <button
        onClick={onLap}
        className={`
          relative flex flex-col items-center justify-center gap-3
          w-full rounded-3xl border-2 transition-all duration-150 select-none
          active:scale-95
          ${lapFlash
            ? 'bg-accent border-accent text-text-inverse scale-95'
            : 'bg-bg-elevated border-accent/40 text-accent hover:border-accent hover:bg-accent/10'
          }
        `}
        style={{ minHeight: '220px' }}
      >
        {isApnea ? <Wind size={40} strokeWidth={1.5} /> : <Flag size={40} strokeWidth={1.5} />}
        <span className="text-2xl font-semibold tracking-wide">{lapLabel}</span>
        {lapsMs.length > 0 && (
          <span className={`text-sm font-mono ${lapFlash ? 'text-text-inverse/80' : 'text-white/60'}`}>
            #{lapsMs.length} · {formatShort(lapsMs[lapsMs.length - 1])}
          </span>
        )}
      </button>

      {/* Liste des laps */}
      {lapsMs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {lapsMs.map((ms, i) => (
            <span
              key={i}
              className="rounded-lg bg-bg-elevated px-2.5 py-1 text-xs font-mono text-white/80 border border-border"
            >
              #{i + 1} {formatShort(ms)}
            </span>
          ))}
        </div>
      )}

      {/* Bouton stop */}
      <button
        onClick={handleStop}
        disabled={stopping}
        className="flex items-center justify-center gap-2 w-full rounded-2xl border border-border py-3.5 text-sm font-medium text-white/80 hover:bg-bg-elevated active:scale-95 transition-all disabled:opacity-50"
      >
        <Square size={15} />
        {stopping ? 'Enregistrement…' : 'Terminer'}
      </button>
    </div>
  )
}

// ── Finished view ─────────────────────────────────────────────────────────────

function FinishedView({
  mode,
  displayMs,
  lapsMs,
  isSaving,
  saved,
  onReset,
}: {
  mode:      TimerMode
  displayMs: number
  lapsMs:    number[]
  isSaving:  boolean
  saved:     boolean
  onReset:   () => void
}) {
  const isApnea       = mode === 'apnea'
  const sectionTitle  = isApnea ? 'Spasmes diaphragmatiques' : 'Laps enregistrés'
  const emptyLabel    = isApnea ? 'Aucun spasme enregistré' : 'Aucun lap enregistré'

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Durée principale */}
      <div className="text-center space-y-1">
        <p className="font-mono text-7xl font-thin tracking-tight text-text-primary select-none tabular-nums">
          {formatChrono(displayMs)}
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {isSaving ? (
            <span className="text-xs text-white/60">Enregistrement…</span>
          ) : saved ? (
            <>
              <CheckCircle2 size={13} className="text-green-400" />
              <span className="text-xs text-green-400">Session sauvegardée</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Résumé laps / spasmes */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
            {sectionTitle}
          </p>
          <span className="text-sm font-semibold text-text-primary">{lapsMs.length}</span>
        </div>

        {lapsMs.length === 0 ? (
          <p className="text-xs text-white/50 text-center py-2">{emptyLabel}</p>
        ) : (
          <div className="space-y-2">
            {lapsMs.map((ms, i) => {
              const intervalMs = i === 0 ? ms : ms - lapsMs[i - 1]
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40 w-5 text-right">#{i + 1}</span>
                    <span className="text-sm font-mono text-text-primary">{formatShort(ms)}</span>
                  </div>
                  <span className="text-xs font-mono text-white/50">{intervalLabel(intervalMs)}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Intervalle moyen si ≥ 2 laps */}
        {lapsMs.length >= 2 && (() => {
          const intervals = lapsMs.slice(1).map((ms, i) => ms - lapsMs[i])
          const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
          return (
            <div className="pt-1 flex items-center justify-between border-t border-border">
              <span className="text-xs text-white/60">Intervalle moyen</span>
              <span className="text-xs font-mono text-white/80">{intervalLabel(avgMs)}</span>
            </div>
          )
        })()}
      </div>

      {/* Recommencer */}
      <button
        onClick={onReset}
        className="flex items-center justify-center gap-2 w-full rounded-2xl bg-accent py-4 text-base font-semibold text-text-inverse hover:opacity-90 active:scale-95 transition-all"
      >
        <RotateCcw size={18} />
        Nouvelle session
      </button>
    </div>
  )
}
