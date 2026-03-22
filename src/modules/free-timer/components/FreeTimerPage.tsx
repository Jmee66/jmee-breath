/**
 * FreeTimerPage — chronomètre d'apnée statique.
 *
 * Phases :
 *  · idle     : prêt à démarrer (configuration warm-up)
 *  · warmup   : compte à rebours d'échauffement respiratoire
 *  · running  : chrono en cours + bouton spasme
 *  · finished : résultats + sauvegarde automatique
 *
 * Timing wall-clock (Date.now()) — aucune dérive rAF/setInterval.
 * Spasmes stockés comme timestamps relatifs au démarrage (secondes).
 * Sauvegarde automatique dans Dexie `freeTimerSessions` à l'arrêt.
 * Personal Best persisté dans localStorage, éditable manuellement.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Square, RotateCcw, Wind, CheckCircle2, SkipForward, Pencil, Check } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { saveFreeTimerSession, getBestFreeTimerSession } from '../services/freeTimerWriter'
import type { FreeTimerSession } from '@core/types'

// ── Formatters ────────────────────────────────────────────────────────────────

/** MM:SS.d  (dixièmes de seconde) */
function formatChrono(ms: number): string {
  const totalS = Math.floor(ms / 1000)
  const m      = Math.floor(totalS / 60)
  const s      = totalS % 60
  const tenth  = Math.floor((ms % 1000) / 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenth}`
}

/** MM:SS pour le compte à rebours warm-up */
function formatCountdown(ms: number): string {
  const totalS = Math.ceil(ms / 1000)
  const m = Math.floor(totalS / 60)
  const s = totalS % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** M:SS court pour les badges de spasme */
function formatShort(ms: number): string {
  const totalS = Math.floor(ms / 1000)
  const m = Math.floor(totalS / 60)
  const s = totalS % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Intervalle entre deux spasmes consécutifs */
function intervalLabel(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `+${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `+${m}min` : `+${m}m${r}s`
}

/** Parse une saisie MM:SS ou un nombre de secondes → secondes (null si invalide) */
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

const PB_KEY = 'apnea_freeTimer_pb_seconds'

function loadPb(): number | null {
  try {
    const v = localStorage.getItem(PB_KEY)
    return v ? parseFloat(v) : null
  } catch {
    return null
  }
}

function savePbToStorage(secs: number | null) {
  try {
    if (secs != null) localStorage.setItem(PB_KEY, String(secs))
    else localStorage.removeItem(PB_KEY)
  } catch { /* ignore */ }
}

// ── Best Session widget (lecture seule — meilleure perf enregistrée) ─────────

function BestSession({ seconds }: { seconds: number | null }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
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
    if (secs != null) {
      onChange(secs)
    } else if (str.trim() === '' || str.trim() === '0') {
      onChange(null)
    }
    setEditing(false)
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
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
          <button
            onMouseDown={(e) => { e.preventDefault(); commit(raw) }}
            className="text-accent/80 hover:text-accent"
          >
            <Check size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={openEdit}
          className="flex items-center gap-1.5 group"
        >
          <span className="text-sm font-mono text-accent group-hover:text-accent/80 tabular-nums">
            {pbSeconds != null ? formatShort(pbSeconds * 1000) : '--:--'}
          </span>
          <Pencil size={11} className="text-white/30 group-hover:text-white/60" />
        </button>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

type TimerPhase = 'idle' | 'warmup' | 'running' | 'finished'

export function FreeTimerPage() {
  const [phase,         setPhase]         = useState<TimerPhase>('idle')
  const [displayMs,     setDisplayMs]     = useState(0)
  const [warmupLeft,    setWarmupLeft]    = useState(0)
  const [warmupSeconds, setWarmupSeconds] = useState(120)
  const [spasmMs,       setSpasmMs]       = useState<number[]>([])
  const [spasmFlash,    setSpasmFlash]    = useState(false)
  const [savedSession,  setSavedSession]  = useState<FreeTimerSession | null>(null)
  const [isSaving,      setIsSaving]      = useState(false)
  const [pbSeconds,          setPbSeconds]          = useState<number | null>(loadPb)
  const [bestSessionSeconds, setBestSessionSeconds] = useState<number | null>(null)

  const handlePbChange = useCallback((secs: number | null) => {
    setPbSeconds(secs)
    savePbToStorage(secs)
  }, [])

  // Refs — pas de dépendances dans les callbacks
  const startWallRef  = useRef<number>(0)
  const startedAtRef  = useRef<string>('')
  const warmupEndRef  = useRef<number>(0)
  const spasmMsRef    = useRef<number[]>([])
  const rafRef        = useRef<number | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef    = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    getBestFreeTimerSession().then((s) => {
      if (s && mountedRef.current) setBestSessionSeconds(s.durationSeconds)
    })
    return () => {
      mountedRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const getElapsed = useCallback((): number => {
    return Date.now() - startWallRef.current
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    // Annule tout RAF en cours (warmup ou autre) avant de démarrer
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    startWallRef.current = Date.now()
    startedAtRef.current = new Date().toISOString()
    spasmMsRef.current   = []
    setSpasmMs([])
    setDisplayMs(0)
    setSavedSession(null)
    setPhase('running')

    const tick = () => {
      if (mountedRef.current) {
        setDisplayMs(Date.now() - startWallRef.current)
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const startWarmup = useCallback((durationS: number) => {
    warmupEndRef.current = Date.now() + durationS * 1000
    setWarmupLeft(durationS * 1000)
    setSavedSession(null)
    setPhase('warmup')

    const tick = () => {
      if (!mountedRef.current) return
      const left = warmupEndRef.current - Date.now()
      if (left <= 0) {
        setWarmupLeft(0)
        startTimer()
        return
      }
      setWarmupLeft(left)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [startTimer])

  const stopTimer = useCallback(async () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const finalMs = getElapsed()
    setDisplayMs(finalMs)
    setPhase('finished')
    setIsSaving(true)
    try {
      const session = await saveFreeTimerSession(
        startedAtRef.current,
        finalMs / 1000,
        spasmMsRef.current.map((ms) => ms / 1000),
      )
      if (mountedRef.current) {
        setSavedSession(session)
        // Auto-update best session et PB si nouveau record
        const finalS = finalMs / 1000
        setBestSessionSeconds((current) =>
          current === null || finalS > current ? finalS : current
        )
        setPbSeconds((current) => {
          if (current === null || finalS > current) {
            savePbToStorage(finalS)
            return finalS
          }
          return current
        })
      }
    } finally {
      if (mountedRef.current) setIsSaving(false)
    }
  }, [getElapsed])

  const recordSpasm = useCallback(() => {
    const t = getElapsed()
    spasmMsRef.current = [...spasmMsRef.current, t]
    setSpasmMs([...spasmMsRef.current])

    setSpasmFlash(true)
    flashTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setSpasmFlash(false)
    }, 180)
  }, [getElapsed])

  const resetTimer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setDisplayMs(0)
    setSpasmMs([])
    setSavedSession(null)
    spasmMsRef.current = []
    setPhase('idle')
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageContainer title="Timer" subtitle="Apnée statique">
      <div className="relative">
        {/* Widgets top-right */}
        <div className="absolute top-0 right-0 flex flex-col items-end gap-3">
          <BestSession seconds={bestSessionSeconds} />
          <PersonalBest pbSeconds={pbSeconds} onChange={handlePbChange} />
        </div>

        {phase === 'idle' && (
          <IdleView
            warmupSeconds={warmupSeconds}
            onWarmupChange={setWarmupSeconds}
            onStart={() => startWarmup(warmupSeconds)}
          />
        )}
        {phase === 'warmup' && (
          <WarmupView
            warmupLeft={warmupLeft}
            totalMs={warmupSeconds * 1000}
            onSkip={startTimer}
            onCancel={resetTimer}
          />
        )}
        {phase === 'running' && (
          <RunningView
            displayMs={displayMs}
            spasmMs={spasmMs}
            spasmFlash={spasmFlash}
            onSpasm={recordSpasm}
            onStop={stopTimer}
          />
        )}
        {phase === 'finished' && (
          <FinishedView
            displayMs={displayMs}
            spasmMs={spasmMs}
            isSaving={isSaving}
            saved={!!savedSession}
            onReset={resetTimer}
          />
        )}
      </div>
    </PageContainer>
  )
}

// ── Idle view ─────────────────────────────────────────────────────────────────

function IdleView({
  warmupSeconds,
  onWarmupChange,
  onStart,
}: {
  warmupSeconds:  number
  onWarmupChange: (s: number) => void
  onStart:        () => void
}) {
  return (
    <div className="flex flex-col items-center gap-6 pt-20">
      {/* Chrono placeholder */}
      <div className="text-center space-y-1">
        <p className="font-mono text-7xl font-thin tracking-tight text-text-primary select-none">
          00:00.0
        </p>
        <p className="text-xs text-white/60">Prêt · Inspirez profondément</p>
      </div>

      {/* Warm-up selector */}
      <div className="card w-full p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
          Échauffement
        </p>
        <div className="grid grid-cols-3 gap-2">
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
        <p className="text-xs text-white/50 text-center min-h-[1rem]">
          {`Respirez calmement pendant ${WARMUP_PRESETS.find((p) => p.value === warmupSeconds)?.label ?? `${warmupSeconds / 60} min`} avant l'apnée`}
        </p>
      </div>

      {/* Instructions */}
      <div className="card w-full p-4 space-y-2 text-center">
        <p className="text-xs text-white/80 leading-relaxed">
          Appuyez sur <strong className="text-text-primary">Démarrer</strong> puis retenez votre souffle.
        </p>
        <p className="text-xs text-white/60 leading-relaxed">
          Tapez <strong className="text-accent">Spasme</strong> à chaque contraction diaphragmatique.
        </p>
      </div>

      <button
        onClick={onStart}
        className="flex items-center gap-3 w-full justify-center rounded-2xl bg-accent py-5 text-lg font-semibold text-text-inverse hover:opacity-90 active:scale-95 transition-all"
      >
        <Play size={22} />
        {warmupSeconds > 0 ? "Démarrer l'échauffement" : 'Démarrer'}
      </button>
    </div>
  )
}

// ── Warmup view ───────────────────────────────────────────────────────────────

function WarmupView({
  warmupLeft,
  totalMs,
  onSkip,
  onCancel,
}: {
  warmupLeft: number
  totalMs:    number
  onSkip:     () => void
  onCancel:   () => void
}) {
  const progress = totalMs > 0 ? 1 - warmupLeft / totalMs : 1

  return (
    <div className="flex flex-col items-center gap-6 pt-20">
      {/* Countdown */}
      <div className="text-center space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent/80">
          Échauffement
        </p>
        <p className="font-mono text-7xl font-thin tracking-tight text-text-primary tabular-nums select-none">
          {formatCountdown(warmupLeft)}
        </p>
        <p className="text-sm text-white/60">Respirez calmement et profondément</p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-accent/50 rounded-full"
          style={{ width: `${progress * 100}%`, transition: 'width 0.12s linear' }}
        />
      </div>

      {/* Tips */}
      <div className="card w-full p-4 text-center">
        <p className="text-xs text-white/70 leading-relaxed">
          Détendez votre corps, relâchez les épaules.<br />
          Le chrono démarrera automatiquement.
        </p>
      </div>

      {/* Skip */}
      <button
        onClick={onSkip}
        className="flex items-center gap-2 w-full justify-center rounded-2xl bg-accent py-4 text-base font-semibold text-text-inverse hover:opacity-90 active:scale-95 transition-all"
      >
        <SkipForward size={18} />
        Commencer maintenant
      </button>

      {/* Cancel */}
      <button
        onClick={onCancel}
        className="flex items-center justify-center w-full rounded-2xl border border-border py-3 text-sm text-white/60 hover:bg-bg-elevated active:scale-95 transition-all"
      >
        Annuler
      </button>
    </div>
  )
}

// ── Running view ──────────────────────────────────────────────────────────────

function RunningView({
  displayMs,
  spasmMs,
  spasmFlash,
  onSpasm,
  onStop,
}: {
  displayMs:  number
  spasmMs:    number[]
  spasmFlash: boolean
  onSpasm:    () => void
  onStop:     () => Promise<void>
}) {
  const [stopping, setStopping] = useState(false)

  const handleStop = async () => {
    setStopping(true)
    await onStop()
  }

  return (
    <div className="flex flex-col gap-5 pt-20">
      {/* Chrono */}
      <div className="text-center">
        <p className="font-mono text-7xl font-thin tracking-tight text-text-primary select-none tabular-nums">
          {formatChrono(displayMs)}
        </p>
        <p className="mt-1 text-xs text-white/60">
          {spasmMs.length === 0
            ? 'En cours…'
            : `${spasmMs.length} spasme${spasmMs.length > 1 ? 's' : ''} enregistré${spasmMs.length > 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Bouton SPASME — zone tactile maximale */}
      <button
        onClick={onSpasm}
        className={`
          relative flex flex-col items-center justify-center gap-3
          w-full rounded-3xl border-2 transition-all duration-150 select-none
          active:scale-95
          ${spasmFlash
            ? 'bg-accent border-accent text-text-inverse scale-95'
            : 'bg-bg-elevated border-accent/40 text-accent hover:border-accent hover:bg-accent/10'
          }
        `}
        style={{ minHeight: '220px' }}
      >
        <Wind size={40} strokeWidth={1.5} />
        <span className="text-2xl font-semibold tracking-wide">Spasme</span>
        {spasmMs.length > 0 && (
          <span className={`text-sm font-mono ${spasmFlash ? 'text-text-inverse/80' : 'text-white/60'}`}>
            #{spasmMs.length} · {formatShort(spasmMs[spasmMs.length - 1])}
          </span>
        )}
      </button>

      {/* Liste des spasmes */}
      {spasmMs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {spasmMs.map((ms, i) => (
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
  displayMs,
  spasmMs,
  isSaving,
  saved,
  onReset,
}: {
  displayMs: number
  spasmMs:   number[]
  isSaving:  boolean
  saved:     boolean
  onReset:   () => void
}) {
  return (
    <div className="flex flex-col gap-5 pt-20">
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

      {/* Résumé spasmes */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Spasmes diaphragmatiques
          </p>
          <span className="text-sm font-semibold text-text-primary">
            {spasmMs.length}
          </span>
        </div>

        {spasmMs.length === 0 ? (
          <p className="text-xs text-white/50 text-center py-2">Aucun spasme enregistré</p>
        ) : (
          <div className="space-y-2">
            {spasmMs.map((ms, i) => {
              const intervalMs = i === 0 ? ms : ms - spasmMs[i - 1]
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40 w-5 text-right">#{i + 1}</span>
                    <span className="text-sm font-mono text-text-primary">
                      {formatShort(ms)}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-white/50">
                    {intervalLabel(intervalMs)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Intervalle moyen si ≥ 2 spasmes */}
        {spasmMs.length >= 2 && (() => {
          const intervals = spasmMs.slice(1).map((ms, i) => ms - spasmMs[i])
          const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
          return (
            <div className="pt-1 flex items-center justify-between border-t border-border">
              <span className="text-xs text-white/60">Intervalle moyen</span>
              <span className="text-xs font-mono text-white/80">
                {intervalLabel(avgMs)}
              </span>
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
