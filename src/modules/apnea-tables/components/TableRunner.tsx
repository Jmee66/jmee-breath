import { useRef, useCallback, useEffect, useState } from 'react'
import { X, Pause, Play } from 'lucide-react'
import type { ApneaTable, RunnerPhase } from '../types'
import { fmtTime, totalTableDuration } from '../services/tableGenerator'
import { BreathClock } from '@modules/breath-engine'
import { BreathVoiceGuide, estimatePreparationDuration } from '@modules/breath-engine/voice/BreathVoiceGuide'
import { BreathCircle } from '@modules/breath-engine'
import { useBreathStore } from '@modules/breath-engine'
import { useSoundStore, useDroneStore, useVoiceGuideStore } from '@modules/breath-engine'
import type { Exercise, Phase } from '@core/types'

// ── Helpers : construction des exercices par phase ────────────────────────────

/** Crée un Exercise "hold" (rétention plein poumon) pour N secondes. */
function makeHoldExercise(holdS: number, label: string): Exercise {
  return {
    id: `table-hold-${holdS}`,
    name: label,
    description: '',
    category: 'preparation',
    difficulty: 1,
    tags: [],
    phases: [{ type: 'hold', durationSeconds: holdS } as Phase],
    repetitions: 1,
    restBetweenRepsSeconds: 0,
    isPreset: true,
    createdAt: '',
    updatedAt: '',
    customPresets: [],
  }
}

/** Crée un Exercise "récupération" cyclique pour N secondes. */
function makeRecoveryExercise(recoveryS: number, pattern: ApneaTable['recoveryPattern']): Exercise {
  let phases: Phase[]
  let cycleS: number

  switch (pattern) {
    case '6-6-12':
      phases  = [
        { type: 'inhale', durationSeconds: 6 } as Phase,
        { type: 'hold',   durationSeconds: 6 } as Phase,
        { type: 'exhale', durationSeconds: 12 } as Phase,
      ]
      cycleS = 24
      break
    case 'co2-pattern':
      phases  = [
        { type: 'inhale', durationSeconds: 4 } as Phase,
        { type: 'hold',   durationSeconds: 2 } as Phase,
        { type: 'exhale', durationSeconds: 10 } as Phase,
      ]
      cycleS = 16
      break
    default: // soupir
      phases  = [
        { type: 'inhale', durationSeconds: 3 } as Phase,
        { type: 'exhale', durationSeconds: 7 } as Phase,
      ]
      cycleS = 10
  }

  const reps = Math.max(1, Math.ceil(recoveryS / cycleS))
  return {
    id: `table-recovery-${recoveryS}`,
    name: 'Récupération',
    description: '',
    category: 'preparation',
    difficulty: 1,
    tags: [],
    phases,
    repetitions: reps,
    restBetweenRepsSeconds: 0,
    isPreset: true,
    createdAt: '',
    updatedAt: '',
    customPresets: [],
  }
}

// ── Composant principal ────────────────────────────────────────────────────────

interface Props {
  table: ApneaTable
  onDone: () => void
}

interface Display {
  rowIndex:        number
  totalRows:       number
  phase:           RunnerPhase
  phaseLabel:      string
  instruction:     string
  phaseRemainingS: number
  phaseTotalS:     number
  totalProgress:   number
}

const PREP_BETWEEN = 3   // secondes de transition entre hold et récup

export function TableRunner({ table, onDone }: Props) {
  // ── Stores ──────────────────────────────────────────────────────────────────
  const breathStore = useBreathStore

  // ── Refs ────────────────────────────────────────────────────────────────────
  const clockRef       = useRef<BreathClock | null>(null)
  const voiceRef       = useRef<BreathVoiceGuide | null>(null)
  const rafRef         = useRef<number | null>(null)
  const startMsRef     = useRef<number>(0)
  const pausedMsRef    = useRef<number>(0)
  const pausedAtRef    = useRef<number | null>(null)

  // Séquence aplatie : [row0-hold, row0-recovery, row1-hold, row1-recovery, ...]
  // Chaque segment : { type: 'hold'|'recovery', rowIndex, startS, endS }
  const segmentsRef = useRef<Array<{
    type: 'hold' | 'recovery'
    rowIndex: number
    startS: number
    endS: number
  }>>([])

  const lastSegmentRef = useRef(-1)
  const mountedRef     = useRef(true)
  const phaseRef       = useRef<RunnerPhase>('idle')

  // ── State UI ────────────────────────────────────────────────────────────────
  const [display, setDisplay] = useState<Display>({
    rowIndex: 0, totalRows: table.rows.length,
    phase: 'idle', phaseLabel: '', instruction: '',
    phaseRemainingS: 0, phaseTotalS: 0, totalProgress: 0,
  })
  const [paused,  setPaused]  = useState(false)
  const [started, setStarted] = useState(false)

  const totalS = totalTableDuration(table.rows)

  // ── Build segments ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cursor = 0
    const segs: typeof segmentsRef.current = []
    table.rows.forEach((row, i) => {
      segs.push({ type: 'hold',     rowIndex: i, startS: cursor, endS: cursor + row.holdS })
      cursor += row.holdS
      segs.push({ type: 'recovery', rowIndex: i, startS: cursor, endS: cursor + row.recoveryS })
      cursor += row.recoveryS
    })
    segmentsRef.current = segs
  }, [table.rows])

  // ── Clock management ────────────────────────────────────────────────────────
  const stopClock = useCallback(() => {
    voiceRef.current?.cancel()
    voiceRef.current = null
    clockRef.current?.stop()
    clockRef.current = null
    breathStore.getState().endSession()
  }, [breathStore])

  const startSegmentClock = useCallback((
    type: 'hold' | 'recovery',
    durationS: number,
    rowIndex: number,
  ) => {
    stopClock()

    const exercise = type === 'hold'
      ? makeHoldExercise(durationS, `Série ${rowIndex + 1}/${table.rows.length}`)
      : makeRecoveryExercise(durationS, table.recoveryPattern)

    const snd = useSoundStore.getState()
    const drn = useDroneStore.getState()
    const vce = useVoiceGuideStore.getState()

    const voice = new BreathVoiceGuide({
      enabled: vce.voiceEnabled,
      volume:  vce.voiceVolume,
      rate:    vce.voiceRate,
      pitch:   vce.voicePitch,
    })
    voice.setExercise(exercise)
    voiceRef.current = voice

    const prepDuration = vce.voiceEnabled
      ? estimatePreparationDuration(exercise, vce.voiceRate)
      : 2

    const clock = new BreathClock(
      {
        onPhaseChange: (phase) => {
          voice.speak(phase.internalType)
          breathStore.getState().setPhaseComplete(phase.publicType, phase.internalType, phase.durationSeconds)
        },
        onTick: (progress) => {
          breathStore.getState().setProgress(progress)
        },
        onRepComplete: () => {},
        onSessionComplete: () => {},
      },
      { enabled: snd.soundEnabled, volume: snd.soundVolume, soundSet: snd.soundSet, bowlOnPhase: snd.bowlOnPhase },
      { enabled: drn.droneEnabled, volume: drn.droneVolume },
    )
    clockRef.current = clock
    void clock.start(exercise, prepDuration)
  }, [stopClock, table.rows.length, table.recoveryPattern, breathStore])

  // ── Master tick ─────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    if (!mountedRef.current) return

    const elapsedS = (Date.now() - startMsRef.current - pausedMsRef.current) / 1000

    if (elapsedS >= totalS) {
      stopClock()
      phaseRef.current = 'done'
      setDisplay((d) => ({ ...d, phase: 'done', totalProgress: 1, phaseRemainingS: 0 }))
      return
    }

    const segs  = segmentsRef.current
    const segIdx = segs.findIndex((s) => elapsedS >= s.startS && elapsedS < s.endS)

    if (segIdx === -1) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const seg = segs[segIdx]

    // Changement de segment → nouveau BreathClock
    if (segIdx !== lastSegmentRef.current) {
      lastSegmentRef.current = segIdx
      const segDuration = seg.endS - seg.startS
      startSegmentClock(seg.type, segDuration, seg.rowIndex)
    }

    const segElapsed    = elapsedS - seg.startS
    const segRemaining  = seg.endS - elapsedS
    const phaseLabel    = seg.type === 'hold' ? 'Rétention' : 'Récupération'
    const instruction   = seg.type === 'hold'
      ? `Série ${seg.rowIndex + 1} / ${table.rows.length} — ${fmtTime(table.rows[seg.rowIndex].holdS)}`
      : 'Récupération — Respirez'

    setDisplay({
      rowIndex:        seg.rowIndex,
      totalRows:       table.rows.length,
      phase:           seg.type === 'hold' ? 'hold' : 'recovery',
      phaseLabel,
      instruction,
      phaseRemainingS: Math.ceil(segRemaining),
      phaseTotalS:     seg.endS - seg.startS,
      totalProgress:   elapsedS / totalS,
    })
    phaseRef.current = seg.type === 'hold' ? 'hold' : 'recovery'

    rafRef.current = requestAnimationFrame(tick)
  }, [totalS, stopClock, startSegmentClock, table.rows])

  // ── Start ────────────────────────────────────────────────────────────────────
  function start() {
    startMsRef.current   = Date.now()
    pausedMsRef.current  = 0
    lastSegmentRef.current = -1
    setStarted(true)
    rafRef.current = requestAnimationFrame(tick)
  }

  // ── Pause / Resume ────────────────────────────────────────────────────────
  function togglePause() {
    if (paused) {
      // Reprendre
      const pauseDuration = Date.now() - (pausedAtRef.current ?? Date.now())
      pausedMsRef.current += pauseDuration
      pausedAtRef.current  = null
      clockRef.current?.resume()
      setPaused(false)
      rafRef.current = requestAnimationFrame(tick)
    } else {
      // Pause
      pausedAtRef.current = Date.now()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      clockRef.current?.pause()
      setPaused(true)
    }
  }

  // ── Visibility (iOS screen lock) ─────────────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        clockRef.current?.handlePageHidden()
      } else {
        if (!paused && started) {
          clockRef.current?.handlePageVisible()
          rafRef.current = requestAnimationFrame(tick)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [paused, started, tick])

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      stopClock()
    }
  }, [stopClock])

  // ── Render ────────────────────────────────────────────────────────────────

  if (display.phase === 'done') {
    return <DoneScreen table={table} onDone={onDone} />
  }

  if (!started) {
    return (
      <StartScreen
        table={table}
        totalS={totalS}
        onStart={start}
        onBack={onDone}
      />
    )
  }

  const isHold     = display.phase === 'hold'
  const accentColor = isHold ? '#7561af' : '#34d399'

  return (
    <div className="flex flex-col h-full bg-bg-base select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-3">
        <button
          onClick={() => { stopClock(); if (rafRef.current) cancelAnimationFrame(rafRef.current); onDone() }}
          className="p-1.5 text-text-muted"
        >
          <X size={20} />
        </button>
        <span className="flex-1 text-sm font-semibold text-text-primary">{table.name}</span>
        <span className="text-xs text-text-muted">
          Série {display.rowIndex + 1} / {display.totalRows}
        </span>
      </div>

      {/* Barre de progression globale */}
      <div className="px-4 mb-2">
        <div className="h-1 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className="h-full rounded-full transition-none"
            style={{ width: `${display.totalProgress * 100}%`, background: accentColor }}
          />
        </div>
      </div>

      {/* Phase label */}
      <div className="px-4 pt-2 pb-1 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
          {display.phaseLabel}
        </p>
        <p className="text-[11px] text-text-muted mt-0.5">{display.instruction}</p>
      </div>

      {/* BreathCircle */}
      <div className="flex-1 flex items-center justify-center">
        <BreathCircle size={220} />
      </div>

      {/* Timer phase */}
      <div className="text-center pb-4">
        <span className="text-5xl font-thin font-mono tabular-nums text-text-primary">
          {fmtTime(display.phaseRemainingS)}
        </span>
      </div>

      {/* Mini table */}
      <div className="px-4 pb-4">
        <TableMiniPreview
          rows={table.rows}
          currentRowIndex={display.rowIndex}
          currentPhase={display.phase === 'hold' ? 'hold' : 'recovery'}
        />
      </div>

      {/* Contrôles */}
      <div className="flex justify-center pb-8">
        <button
          onClick={togglePause}
          className="h-14 w-14 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-text-primary"
        >
          {paused ? <Play size={22} /> : <Pause size={22} />}
        </button>
      </div>
    </div>
  )
}

// ── Écran de démarrage ────────────────────────────────────────────────────────

function StartScreen({
  table, totalS, onStart, onBack,
}: {
  table: ApneaTable; totalS: number; onStart: () => void; onBack: () => void
}) {
  const maxHold = Math.max(...table.rows.map((r) => r.holdS))
  return (
    <div className="flex flex-col h-full bg-bg-base px-6">
      <div className="flex items-center gap-2 pt-6 pb-4">
        <button onClick={onBack} className="p-1.5 text-text-muted"><X size={20} /></button>
        <span className="text-lg font-bold text-text-primary flex-1">{table.name}</span>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-6">
        <div className="text-center space-y-2">
          <p className="text-4xl font-bold text-text-primary uppercase tracking-wide">
            {table.type.toUpperCase()}
          </p>
          <p className="text-text-muted text-sm">
            {table.rows.length} séries · {fmtTime(totalS)} total · Max {fmtTime(maxHold)}
          </p>
        </div>

        {/* Aperçu miniature */}
        <div className="space-y-1">
          {table.rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-5 text-right text-text-muted font-mono">{i + 1}</span>
              <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden flex">
                <div
                  className="h-full bg-purple-500/60"
                  style={{ width: `${(row.holdS / (row.holdS + row.recoveryS)) * 100}%` }}
                />
                <div className="flex-1 h-full bg-green-500/30" />
              </div>
              <span className="text-text-muted w-20 text-right">
                {fmtTime(row.holdS)} / {fmtTime(row.recoveryS)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="pb-10">
        <button
          onClick={onStart}
          className="w-full py-4 rounded-2xl bg-accent text-white font-bold text-lg shadow-lg"
        >
          Démarrer
        </button>
      </div>
    </div>
  )
}

// ── Écran de fin ──────────────────────────────────────────────────────────────

function DoneScreen({ table, onDone }: { table: ApneaTable; onDone: () => void }) {
  return (
    <div className="flex flex-col h-full bg-bg-base items-center justify-center px-6 text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center text-4xl">
        🎯
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary">Table terminée</p>
        <p className="text-text-muted mt-1">{table.name} · {table.rows.length} séries</p>
      </div>
      <button
        onClick={onDone}
        className="px-8 py-3 rounded-2xl bg-accent text-white font-semibold"
      >
        Retour
      </button>
    </div>
  )
}

// ── Mini preview en cours de session ──────────────────────────────────────────

function TableMiniPreview({
  rows, currentRowIndex, currentPhase,
}: {
  rows: ApneaTable['rows']
  currentRowIndex: number
  currentPhase: 'hold' | 'recovery'
}) {
  const maxHold = Math.max(...rows.map((r) => r.holdS), 1)
  return (
    <div className="flex items-end gap-0.5 h-8">
      {rows.map((row, i) => {
        const isCurrentHold     = i === currentRowIndex && currentPhase === 'hold'
        const isCurrentRecovery = i === currentRowIndex && currentPhase === 'recovery'
        const isDone            = i < currentRowIndex
        return (
          <div key={i} className="flex-1 flex flex-col gap-0.5 items-center">
            <div
              className={`w-full rounded-sm transition-colors ${
                isCurrentHold   ? 'bg-purple-400'  :
                isDone          ? 'bg-purple-400/30' :
                                  'bg-white/10'
              }`}
              style={{ height: `${Math.max(20, (row.holdS / maxHold) * 100)}%` }}
            />
            <div
              className={`w-full h-0.5 rounded-sm transition-colors ${
                isCurrentRecovery ? 'bg-green-400'  :
                isDone            ? 'bg-green-400/30' :
                                    'bg-white/5'
              }`}
            />
          </div>
        )
      })}
    </div>
  )
}
