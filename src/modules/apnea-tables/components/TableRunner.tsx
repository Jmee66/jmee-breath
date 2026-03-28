/**
 * TableRunner — v2
 *
 * Architecture : la table est convertie en un seul Exercise (phases à plat),
 * confié à UN SEUL BreathClock du début à la fin.
 * Tout le timing, les animations, les sons et la voix sont délégués au BreathEngine.
 * Ce composant ne gère que l'affichage des métadonnées spécifiques aux tables
 * (numéro de série, label de phase, progression globale, décompte custom).
 */

import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { X, Pause, Play } from 'lucide-react'
import type { ApneaTable, CustomPhaseType, RunnerPhase } from '../types'
import type { Exercise, Phase, PhaseType } from '@core/types'
import { fmtTime, CUSTOM_PHASE_CONFIG, customProgramDuration } from '../services/tableGenerator'
import { BreathClock }                    from '@modules/breath-engine'
import { BreathVoiceGuide, estimatePreparationDuration } from '@modules/breath-engine/voice/BreathVoiceGuide'
import { BreathVisual }                   from '@modules/breath-engine'
import { useBreathStore }                 from '@modules/breath-engine'
import { useSoundStore, useDroneStore, useVoiceGuideStore } from '@modules/breath-engine'

// ── Conversion ApneaTable → Exercise ─────────────────────────────────────────
//
// Principe : chaque ligne/phase de la table devient une Phase[] plate.
// repetitions: 1 → le BreathClock joue la séquence une seule fois.
// Timing CO2/O2 : inhale(INHALE_S) + hold(holdS) + recovery(recoveryS - INHALE_S)
//   → la durée totale par ligne est préservée.

const INHALE_S = 3  // inspiration courte avant chaque apnée

interface SegmentMeta {
  rowIndex:    number          // numéro de série affiché (0-based)
  totalRows:   number          // total de séries
  phaseLabel:  string          // ex. "Rétention"
  instruction: string          // ex. "Série 3 / 8"
  description: string | undefined
  accentColor: string
  isCountdown: boolean
  showNumbers: boolean         // countdown only — afficher les chiffres
  voiceWord:   string | null   // mot prononcé par la voix (null = silence)
  phaseStartS: number          // cumul de toutes les phases précédentes (pour totalProgress)
}

/** Mappe un CustomPhaseType vers le PhaseType du BreathEngine. */
function mapCustomType(t: CustomPhaseType): PhaseType {
  if (t === 'inhale') return 'inhale'
  if (t === 'hold')   return 'hold'
  if (t === 'exhale') return 'exhale'
  // prep, recovery, ventilation, countdown → recovery (cercle statique vert)
  return 'recovery'
}

/** Construit l'Exercise complet + les métadonnées d'affichage par phase. */
function buildTableExercise(table: ApneaTable): {
  exercise: Exercise
  metadata: SegmentMeta[]
  totalS:   number
} {
  const phases:   Phase[]       = []
  const metadata: SegmentMeta[] = []
  let cursor = 0

  function push(p: Phase, meta: Omit<SegmentMeta, 'phaseStartS'>) {
    metadata.push({ ...meta, phaseStartS: cursor })
    phases.push(p)
    cursor += p.durationSeconds
  }

  // ── CO2 / O2 ──────────────────────────────────────────────────────────────
  if (table.type !== 'custom') {
    const rows = table.rows
    rows.forEach((row, i) => {
      const serie = `Série ${i + 1} / ${rows.length}`
      push(
        { type: 'inhale',   durationSeconds: INHALE_S,                               label: serie },
        { rowIndex: i, totalRows: rows.length, phaseLabel: 'Inspiration', instruction: serie, description: undefined, accentColor: '#1a85c2', isCountdown: false, showNumbers: true, voiceWord: 'Inspirez' },
      )
      push(
        { type: 'hold',     durationSeconds: row.holdS,                               label: `Rétention ${fmtTime(row.holdS)}` },
        { rowIndex: i, totalRows: rows.length, phaseLabel: 'Rétention',   instruction: serie, description: undefined, accentColor: '#7561af', isCountdown: false, showNumbers: true, voiceWord: 'Retenez' },
      )
      push(
        { type: 'recovery', durationSeconds: Math.max(2, row.recoveryS - INHALE_S),  label: 'Récupérez' },
        { rowIndex: i, totalRows: rows.length, phaseLabel: 'Récupération', instruction: 'Respirez librement', description: table.recoveryNote ?? undefined, accentColor: '#34d399', isCountdown: false, showNumbers: true, voiceWord: 'Récupérez' },
      )
    })

  // ── Custom ─────────────────────────────────────────────────────────────────
  } else {
    const program = table.customProgram ?? []

    for (const item of program) {
      if (item.kind === 'phase') {
        const cfg = CUSTOM_PHASE_CONFIG[item.phaseType]
        const isCountdown = item.phaseType === 'countdown'
        push(
          { type: mapCustomType(item.phaseType), durationSeconds: item.durationS, label: cfg.label },
          { rowIndex: 0, totalRows: 1, phaseLabel: cfg.label, instruction: cfg.label, description: item.description || undefined, accentColor: cfg.color, isCountdown, showNumbers: isCountdown ? (item.showNumbers !== false) : true, voiceWord: cfg.voiceWord },
        )
      } else {
        for (let r = 0; r < item.repeatCount; r++) {
          for (const p of item.items) {
            const cfg = CUSTOM_PHASE_CONFIG[p.phaseType]
            const isCountdown = p.phaseType === 'countdown'
            push(
              { type: mapCustomType(p.phaseType), durationSeconds: p.durationS, label: cfg.label },
              { rowIndex: r, totalRows: item.repeatCount, phaseLabel: cfg.label, instruction: `${item.label} ${r + 1} / ${item.repeatCount}`, description: p.description || undefined, accentColor: cfg.color, isCountdown, showNumbers: isCountdown ? (p.showNumbers !== false) : true, voiceWord: cfg.voiceWord },
            )
          }
        }
      }
    }
  }

  const exercise: Exercise = {
    id:                    `table-${table.id}`,
    name:                  table.name,
    description:           '',
    category:              table.category ?? 'apnea',
    difficulty:            1,
    tags:                  [],
    phases,
    repetitions:           1,
    restBetweenRepsSeconds: 0,
    isPreset:              false,
    createdAt:             table.createdAt,
    updatedAt:             table.updatedAt,
  }

  return { exercise, metadata, totalS: cursor }
}

// ── Vocal décompte (10 → 4) ───────────────────────────────────────────────────

function speakCountdownNumber(n: number, volume: number, rate: number) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(String(n))
  utt.rate   = Math.max(0.5, rate * 1.1)
  utt.volume = volume
  utt.lang   = 'fr-FR'
  window.speechSynthesis.speak(utt)
}

// ── Display state ─────────────────────────────────────────────────────────────

interface Display {
  rowIndex:        number
  totalRows:       number
  phase:           RunnerPhase
  phaseLabel:      string
  instruction:     string
  description?:    string
  phaseRemainingS: number
  phaseTotalS:     number
  totalProgress:   number
  accentColor:     string
  isCountdown:     boolean
  showNumbers:     boolean
  countdownN?:     number
}

// ── Composant principal ───────────────────────────────────────────────────────

interface Props {
  table:  ApneaTable
  onDone: () => void
}

export function TableRunner({ table, onDone }: Props) {
  const breathStore = useBreathStore
  const clockRef    = useRef<BreathClock | null>(null)
  const voiceRef    = useRef<BreathVoiceGuide | null>(null)
  const mountedRef  = useRef(true)

  // Références stables pour les callbacks du BreathClock (pas de re-création)
  const currentMetaRef     = useRef<SegmentMeta | null>(null)
  const currentPhaseDurRef = useRef(0)
  const lastCountdownNRef  = useRef(-1)

  const [display,  setDisplay]  = useState<Display>({
    rowIndex: 0, totalRows: 0, phase: 'idle', phaseLabel: '',
    instruction: '', phaseRemainingS: 0, phaseTotalS: 0,
    totalProgress: 0, accentColor: '#7561af', isCountdown: false, showNumbers: true,
  })
  const [paused,  setPaused]  = useState(false)
  const [started, setStarted] = useState(false)


  // Construction une seule fois (mémoïsé)
  const { exercise, metadata, totalS } = useMemo(() => buildTableExercise(table), [table])


  // ── Arrêt propre ─────────────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    voiceRef.current?.cancel()
    voiceRef.current = null
    clockRef.current?.stop()
    clockRef.current = null
    breathStore.getState().endSession()
  }, [breathStore])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopSession()
    }
  }, [stopSession])

  // ── Démarrage ─────────────────────────────────────────────────────────────────
  function start() {
    const vce = useVoiceGuideStore.getState()
    const snd = useSoundStore.getState()
    const drn = useDroneStore.getState()

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
        // ── Changement de phase ───────────────────────────────────────────────
        onPhaseChange: (phase) => {
          if (!mountedRef.current) return

          // Phase de préparation (phaseIndex = -1) → BreathEngine gère tout
          if (phase.phaseIndex < 0) {
            voice.speak(phase.internalType)
            breathStore.getState().setPhaseComplete(phase.publicType, phase.internalType, phase.durationSeconds)
            currentMetaRef.current     = null
            currentPhaseDurRef.current = phase.durationSeconds
            setDisplay(d => ({
              ...d, phase: 'idle', phaseLabel: 'Préparation',
              instruction: 'Préparez-vous…', phaseTotalS: phase.durationSeconds,
              description: table.description,
              accentColor: '#4a5568', isCountdown: false, showNumbers: true, countdownN: undefined,
            }))
            return
          }

          const meta = metadata[phase.phaseIndex]
          if (!meta) return

          // Voix : utilise le voiceWord centralisé dans CUSTOM_PHASE_CONFIG
          // ("Inspirez", "Ventilez", "Préparez-vous"…) plutôt que l'internalType
          // mappé qui serait identique ('recovery') pour ventilation, prep, etc.
          // null = silence (ex. countdown géré dans onTick).
          if (meta.voiceWord) voice.speakText(meta.voiceWord)

          // Mise à jour atomique du BreathEngine → BreathCircle s'anime automatiquement
          breathStore.getState().setPhaseComplete(phase.publicType, phase.internalType, phase.durationSeconds)

          currentMetaRef.current     = meta
          currentPhaseDurRef.current = phase.durationSeconds
          lastCountdownNRef.current  = -1

          setDisplay(d => ({
            ...d,
            rowIndex:    meta.rowIndex,
            totalRows:   meta.totalRows,
            phase:       phase.publicType === 'hold' ? 'hold' : 'recovery',
            phaseLabel:  meta.phaseLabel,
            instruction: meta.instruction,
            description: meta.description,
            phaseTotalS: phase.durationSeconds,
            accentColor: meta.accentColor,
            isCountdown: meta.isCountdown,
            showNumbers: meta.showNumbers,
            countdownN:  undefined,
          }))
        },

        // ── Tick 60 fps ───────────────────────────────────────────────────────
        onTick: (progress, remainingS) => {
          if (!mountedRef.current) return

          // BreathEngine : animation + timer interne
          breathStore.getState().setProgress(progress)
          breathStore.getState().setRemaining(remainingS)

          // Progression globale (phaseStartS + progression dans la phase courante)
          const meta          = currentMetaRef.current
          const phaseStartS   = meta?.phaseStartS ?? 0
          const phaseDur      = currentPhaseDurRef.current
          const totalProgress = Math.min(1, (phaseStartS + phaseDur * progress) / totalS)

          // Décompte : vocal 10→4, visuel 10→4
          let countdownN: number | undefined
          if (meta?.isCountdown) {
            const n = Math.ceil(remainingS)
            countdownN = n > 0 ? n : undefined
            if (n >= 4 && n !== lastCountdownNRef.current) {
              lastCountdownNRef.current = n
              const vceState = useVoiceGuideStore.getState()
              if (vceState.voiceEnabled) speakCountdownNumber(n, vceState.voiceVolume, vceState.voiceRate)
            }
          }

          setDisplay(d => ({
            ...d,
            phaseRemainingS: Math.ceil(remainingS),
            totalProgress,
            countdownN,
          }))
        },

        onRepComplete: () => {},

        // ── Fin de session ────────────────────────────────────────────────────
        onSessionComplete: () => {
          if (!mountedRef.current) return
          stopSession()
          setDisplay(d => ({ ...d, phase: 'done', totalProgress: 1 }))
        },
      },
      { enabled: snd.soundEnabled, volume: snd.soundVolume, soundSet: snd.soundSet, bowlOnPhase: snd.bowlOnPhase },
      { enabled: drn.droneEnabled, volume: drn.droneVolume },
    )

    clockRef.current = clock
    breathStore.getState().startSession(`table-${table.id}`, 1)
    void clock.start(exercise, prepDuration)
    setStarted(true)
  }

  // ── Pause / Resume ────────────────────────────────────────────────────────────
  function togglePause() {
    if (paused) {
      clockRef.current?.resume()
      breathStore.getState().resumeSession()
      setPaused(false)
    } else {
      clockRef.current?.pause()
      breathStore.getState().pauseSession()
      setPaused(true)
    }
  }

  // ── Visibilité (verrouillage écran iOS) ───────────────────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (!started || paused) return
      if (document.visibilityState === 'hidden') {
        clockRef.current?.handlePageHidden()
      } else {
        clockRef.current?.handlePageVisible()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [started, paused])

  // ── Render ────────────────────────────────────────────────────────────────────

  if (display.phase === 'done') return <DoneScreen table={table} onDone={onDone} />

  if (!started) return (
    <StartScreen table={table} totalS={totalS} onStart={start} onBack={onDone} />
  )

  const accentColor = display.accentColor

  return (
    <div className="flex flex-col h-full bg-bg-base select-none">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-3">
        <button
          onClick={() => { stopSession(); onDone() }}
          className="p-1.5 text-text-muted"
        >
          <X size={20} />
        </button>
        <span className="flex-1 text-sm font-semibold text-text-primary">{table.name}</span>
        {display.totalRows > 0 && (
          <span className="text-xs text-text-muted">
            Série {display.rowIndex + 1} / {display.totalRows}
          </span>
        )}
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

      {/* Label de phase — hauteur FIXE, pas de description ici */}
      <div className="px-4 text-center" style={{ height: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
          {display.phaseLabel}
        </p>
        <p className="text-[11px] text-text-muted mt-0.5">{display.instruction}</p>
      </div>

      {/* Centre — BreathVisual toujours présent, décompte superposé en overlay */}
      <div className="flex-1 flex items-center justify-center">
        <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BreathVisual />
          {/* Overlay décompte : visible uniquement si showNumbers (réglé dans l'éditeur) */}
          {display.isCountdown && display.showNumbers && display.countdownN !== undefined && display.countdownN >= 4 && (
            <span style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '120px', fontWeight: 200, color: '#f59e0b',
              lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              pointerEvents: 'none',
            }}>
              {display.countdownN}
            </span>
          )}
        </div>
      </div>

      {/* Description — zone fixe sous le cercle, vide si pas de description */}
      <div className="px-8 text-center" style={{ height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {display.description && (
          <p className="text-sm text-text-secondary leading-snug line-clamp-2">
            {display.description}
          </p>
        )}
      </div>

      {/* Timer phase — hauteur fixe */}
      <div className="text-center" style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-5xl font-thin font-mono tabular-nums text-text-primary">
          {fmtTime(display.phaseRemainingS)}
        </span>
      </div>

      {/* Mini preview (CO2/O2) — hauteur fixe, invisible pour custom */}
      <div className="px-4" style={{ height: '44px' }}>
        {table.type !== 'custom' && table.rows.length > 0 && (
          <TableMiniPreview
            rows={table.rows}
            currentRowIndex={display.rowIndex}
            currentPhase={display.phase === 'hold' ? 'hold' : 'recovery'}
          />
        )}
      </div>

      {/* Contrôles */}
      <div className="flex items-center justify-center pb-8">
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
  const isCustom  = table.type === 'custom'
  const rowCount  = isCustom
    ? (table.customProgram ? Math.max(...table.customProgram.filter(i => i.kind === 'group').map(i => i.kind === 'group' ? i.repeatCount : 0), 0) : 0)
    : table.rows.length
  const maxHold   = isCustom ? 0 : (table.rows.length > 0 ? Math.max(...table.rows.map(r => r.holdS)) : 0)

  return (
    <div className="flex flex-col h-full bg-bg-base px-6">
      <div className="flex items-center gap-2 pt-6 pb-4">
        <button onClick={onBack} className="p-1.5 text-text-muted"><X size={20} /></button>
        <span className="text-lg font-bold text-text-primary flex-1">{table.name}</span>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-6">
        <div className="text-center space-y-2">
          <p className="text-4xl font-bold text-text-primary uppercase tracking-wide">
            {table.type === 'co2' ? 'CO₂' : table.type === 'o2' ? 'O₂' : 'Custom'}
          </p>
          <p className="text-text-muted text-sm">
            {rowCount > 0 ? `${rowCount} séries · ` : ''}{fmtTime(totalS)} total
            {maxHold > 0 ? ` · Max ${fmtTime(maxHold)}` : ''}
          </p>
        </div>

        {/* Aperçu barres (CO2/O2 seulement) */}
        {!isCustom && table.rows.length > 0 && (
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
        )}
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
  const seriesCount = table.type === 'custom'
    ? customProgramDuration(table.customProgram ?? [])   // durée en secondes pour custom
    : table.rows.length
  return (
    <div className="flex flex-col h-full bg-bg-base items-center justify-center px-6 text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center text-4xl">
        🎯
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary">Table terminée</p>
        <p className="text-text-muted mt-1">
          {table.name} · {table.type !== 'custom' ? `${seriesCount} séries` : 'Programme terminé'}
        </p>
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

// ── Mini preview (CO2/O2) ─────────────────────────────────────────────────────

function TableMiniPreview({
  rows, currentRowIndex, currentPhase,
}: {
  rows: ApneaTable['rows']
  currentRowIndex: number
  currentPhase: 'hold' | 'recovery'
}) {
  const maxHold = Math.max(...rows.map(r => r.holdS), 1)
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
                isCurrentHold ? 'bg-purple-400' : isDone ? 'bg-purple-400/30' : 'bg-white/10'
              }`}
              style={{ height: `${Math.max(20, (row.holdS / maxHold) * 100)}%` }}
            />
            <div
              className={`w-full h-0.5 rounded-sm transition-colors ${
                isCurrentRecovery ? 'bg-green-400' : isDone ? 'bg-green-400/30' : 'bg-white/5'
              }`}
            />
          </div>
        )
      })}
    </div>
  )
}
