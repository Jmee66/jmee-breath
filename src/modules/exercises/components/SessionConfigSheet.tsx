import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Play, Minus, Plus, Save, Check } from 'lucide-react'
import type { Exercise, Phase, PhaseType, ExercisePreset } from '@core/types'
import { calcExerciseDuration } from '@core/types'
import { saveExercise, getAllExercises } from '../services/exerciseRepository'
import { useExerciseStore } from '../store/exerciseStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

const PHASE_NAMES: Record<PhaseType, string> = {
  inhale:   'Inspiration',
  hold:     'Rétention',
  exhale:   'Expiration',
  recovery: 'Pause',
}

const PHASE_COLORS: Record<PhaseType, string> = {
  inhale:   'text-phase-inhale',
  hold:     'text-phase-hold',
  exhale:   'text-phase-exhale',
  recovery: 'text-phase-recovery',
}

const PHASE_ICONS: Record<PhaseType, string> = {
  inhale:   '↑',
  hold:     '⏸',
  exhale:   '↓',
  recovery: '○',
}

const QUICK_DURATIONS = [4, 5.5, 6]

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  if (m === 0) return `${sec}s`
  if (sec === 0) return `${m}min`
  return `${m}min ${sec}s`
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

function isSymmetric(phases: Phase[]): boolean {
  return phases.length > 0 && phases.every((p) => p.durationSeconds === phases[0].durationSeconds)
}

// ── Props ────────────────────────────────────────────────────────────────────

interface SessionConfigSheetProps {
  exercise: Exercise
  onClose: () => void
  onStart: (configured: Exercise) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionConfigSheet({ exercise, onClose, onStart }: SessionConfigSheetProps) {
  const { setExercises } = useExerciseStore()

  const [customPresets, setCustomPresets] = useState<ExercisePreset[]>(
    exercise.customPresets ?? []
  )
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  const isCustom = exercise.category === 'custom'

  const [asymmetric, setAsymmetric] = useState(() => isCustom || !isSymmetric(exercise.phases))
  const [symDuration, setSymDuration] = useState(() =>
    isSymmetric(exercise.phases) ? (exercise.phases[0]?.durationSeconds ?? 4) : 4
  )
  const [phases, setPhases] = useState<Phase[]>(exercise.phases)
  const [repetitions, setRepetitions] = useState(exercise.repetitions)

  const [showPresetName, setShowPresetName] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [saved, setSaved] = useState(false)

  const effectivePhases = asymmetric
    ? phases
    : phases.map((p) => ({ ...p, durationSeconds: symDuration }))

  const totalSeconds = calcExerciseDuration({
    ...exercise,
    phases: effectivePhases,
    repetitions,
  })

  // ── Handlers ──

  function handleQuickSelect(d: number) {
    setSymDuration(d)
    setAsymmetric(false)
    setSelectedPresetId(null)
  }

  function handleManualToggle() {
    setAsymmetric(true)
    setSelectedPresetId(null)
  }

  function handlePhaseChange(idx: number, delta: number) {
    setSelectedPresetId(null)
    setPhases((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, durationSeconds: clamp(p.durationSeconds + delta, 1, 300) } : p
      )
    )
  }

  function handleSelectCustomPreset(preset: ExercisePreset) {
    setPhases(preset.phases)
    setRepetitions(preset.repetitions)
    const sym = isSymmetric(preset.phases)
    setAsymmetric(!sym)
    if (sym) setSymDuration(preset.phases[0].durationSeconds)
    setSelectedPresetId(preset.id)
    setShowPresetName(false)
  }

  async function persistPresets(updated: ExercisePreset[]) {
    setCustomPresets(updated)
    await saveExercise({ ...exercise, customPresets: updated, updatedAt: new Date().toISOString() })
    const all = await getAllExercises()
    setExercises(all)
  }

  async function handleSavePreset() {
    const newPreset: ExercisePreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      phases: effectivePhases,
      repetitions,
    }
    const updated = [...customPresets, newPreset]
    await persistPresets(updated)
    setSelectedPresetId(newPreset.id)
    setShowPresetName(false)
    setPresetName('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDeletePreset(id: string) {
    const updated = customPresets.filter((p) => p.id !== id)
    if (selectedPresetId === id) setSelectedPresetId(null)
    await persistPresets(updated)
  }

  function handleStart() {
    onStart({ ...exercise, phases: effectivePhases, repetitions })
  }

  // ── Render ──

  const content = (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      {/* Couche blur — pointer-events:none */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}
        className="bg-black/60 backdrop-blur-sm" />
      {/* Couche cliquable pour fermer */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
        onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg rounded-t-3xl bg-bg-surface border border-border border-b-0 animate-slide-up" style={{ zIndex: 2 }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '2px 16px 10px' }}>
          <h2 className="text-base font-semibold text-text-primary">{exercise.name}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-text-muted hover:bg-bg-elevated transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="safe-bottom" style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* ── Rythme ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

            {/* Rangée standard : 4s / 5.5s / 6s / Manuel — masquée pour les exercices Custom */}
            {!isCustom && (
              <div style={{ display: 'flex', gap: '6px' }}>
                {QUICK_DURATIONS.map((d) => {
                  const active = !asymmetric && symDuration === d && selectedPresetId === null
                  return (
                    <button
                      key={d}
                      onClick={() => handleQuickSelect(d)}
                      style={{
                        flex: 1,
                        padding: '7px 0',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 600,
                        border: active ? 'none' : '1px solid var(--color-border)',
                        background: active ? 'var(--color-accent)' : 'transparent',
                        color: active ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {d}s
                    </button>
                  )
                })}
                <button
                  onClick={handleManualToggle}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: asymmetric && selectedPresetId === null ? 'none' : '1px solid var(--color-border)',
                    background: asymmetric && selectedPresetId === null ? 'var(--color-accent)' : 'transparent',
                    color: asymmetric && selectedPresetId === null ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Manuel
                </button>
              </div>
            )}

            {/* Rangée custom presets (si existants) */}
            {customPresets.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {customPresets.map((preset) => {
                  const active = selectedPresetId === preset.id
                  return (
                    <div key={preset.id} style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: active ? 'none' : '1px solid var(--color-border)', background: active ? 'var(--color-accent)' : 'transparent' }}>
                      <button
                        onClick={() => handleSelectCustomPreset(preset)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: 'transparent',
                          border: 'none',
                          color: active ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {preset.name}
                      </button>
                      <button
                        onClick={() => handleDeletePreset(preset.id)}
                        style={{
                          padding: '6px 8px 6px 0',
                          background: 'transparent',
                          border: 'none',
                          color: active ? 'var(--color-text-inverse)' : 'var(--color-text-muted)',
                          cursor: 'pointer',
                          opacity: 0.7,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Mode Manuel — contrôles individuels */}
            {asymmetric && (
              <div style={{ background: 'var(--color-bg-elevated)', borderRadius: '14px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {phases.map((phase, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className={`text-xs font-semibold ${PHASE_COLORS[phase.type]}`} style={{ width: '90px' }}>
                      {PHASE_ICONS[phase.type]} {PHASE_NAMES[phase.type]}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                      <button
                        onClick={() => handlePhaseChange(idx, -0.5)}
                        style={{ border: '1px solid var(--color-border)', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}
                      >
                        <Minus size={12} />
                      </button>
                      <span style={{ width: '44px', textAlign: 'center', fontSize: '13px', fontFamily: 'monospace', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                        {phase.durationSeconds}s
                      </span>
                      <button
                        onClick={() => handlePhaseChange(idx, 0.5)}
                        style={{ border: '1px solid var(--color-border)', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Sauvegarder comme preset (mode Manuel seulement) */}
                {!showPresetName && (
                  <button
                    onClick={() => { setShowPresetName(true); setPresetName('') }}
                    style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px dashed var(--color-border)', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
                  >
                    {saved
                      ? <><Check size={13} color="var(--color-accent)" /><span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 600 }}>Sauvegardé !</span></>
                      : <><Save size={13} color="var(--color-text-muted)" /><span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Sauvegarder comme preset</span></>
                    }
                  </button>
                )}

                {/* Saisie du nom */}
                {showPresetName && (
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      autoFocus
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && presetName.trim()) handleSavePreset() }}
                      placeholder="Nom du preset (ex : Julien)"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-surface)',
                        color: 'var(--color-text-primary)',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setShowPresetName(false)}
                        style={{ flex: 1, padding: '8px', borderRadius: '10px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '13px', cursor: 'pointer' }}
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSavePreset}
                        disabled={!presetName.trim()}
                        style={{ flex: 2, padding: '8px', borderRadius: '10px', border: 'none', background: presetName.trim() ? 'var(--color-accent)' : 'var(--color-bg-elevated)', color: presetName.trim() ? 'var(--color-text-inverse)' : 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600, cursor: presetName.trim() ? 'pointer' : 'default' }}
                      >
                        Sauvegarder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Répétitions — ligne inline ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-bg-elevated)', borderRadius: '12px', padding: '8px 12px' }}>
            <span className="text-xs font-semibold uppercase tracking-widest text-text-muted" style={{ flex: 1 }}>Répétitions</span>
            <button
              onClick={() => setRepetitions((r) => clamp(r - 1, 1, 99))}
              style={{ border: '1px solid var(--color-border)', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
            >
              <Minus size={12} />
            </button>
            <span style={{ width: '32px', textAlign: 'center', fontSize: '15px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
              {repetitions}
            </span>
            <button
              onClick={() => setRepetitions((r) => clamp(r + 1, 1, 99))}
              style={{ border: '1px solid var(--color-border)', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
            >
              <Plus size={12} />
            </button>
          </div>

          {/* ── Démarrer ── */}
          <button
            onClick={handleStart}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', borderRadius: '14px', background: 'var(--color-accent)', padding: '12px', border: 'none', cursor: 'pointer' }}
            className="hover:opacity-90 active:opacity-75 transition-opacity"
          >
            <Play size={16} fill="var(--color-text-inverse)" color="var(--color-text-inverse)" />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-inverse)' }}>Démarrer</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-inverse)', opacity: 0.7, fontFamily: 'monospace' }}>
              {repetitions}× · {formatDuration(totalSeconds)}
            </span>
          </button>

        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
