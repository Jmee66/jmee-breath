/**
 * BreathVoiceGuide — guidage vocal méditatif.
 *
 * Classe pure TypeScript — aucun import React.
 * Utilise la Web Speech API (SpeechSynthesis).
 *
 * ── Comportement par phase ───────────────────────────────────────────────────
 *  · preparation : décrit l'exercice (phases + répétitions) — durée calculée
 *                  via estimatePreparationDuration() et passée au BreathClock.
 *  · inhale      : "Inspirez"
 *  · hold-full   : "Retenez"
 *  · exhale      : "Expirez"
 *  · hold-empty  : "Retenez"
 *  · recovery    : "Récupérez"
 *
 * ── Sélection de voix ────────────────────────────────────────────────────────
 * Priorité décroissante (score le plus élevé gagne) :
 *  1. "Google français" (Chrome desktop/Android) — neuronale en ligne
 *  2. Voix en ligne non-locales (généralement neuronales)
 *  3. Hortense / Julie (Windows), Amélie (macOS)
 *  4. N'importe quelle fr-FR, puis fr-*
 *
 * ── Cross-platform (Chrome uniquement) ───────────────────────────────────────
 *  - Cache de voix au niveau MODULE (une seule init, pas de fuite mémoire).
 *  - Bug iOS Chrome : speechSynthesis peut rester "paused" → resume() préventif.
 */

import type { Exercise, PhaseType } from '@core/types'
import type { InternalPhaseType } from '../clock/types'

export interface VoiceGuideSettings {
  enabled: boolean
  /** Volume 0–1 */
  volume: number
  /** Débit de parole — 0.5 (lent) → 1.0 (normal) */
  rate: number
  /** Hauteur — 0.5 (grave) → 1.5 (aigu). Ignoré par Google TTS. */
  pitch: number
}

// ── Textes courts des phases actives ─────────────────────────────────────────
const PHASE_WORD: Record<InternalPhaseType, string | null> = {
  preparation:  null,       // géré dynamiquement (description exercice)
  inhale:       'Inspirez',
  'hold-full':  'Retenez',
  exhale:       'Expirez',
  'hold-empty': 'Retenez',
  recovery:     'Récupérez',
  ventilation:  'Ventilez',
}

// Labels de phase pour la description de l'exercice
const PHASE_LABEL: Record<PhaseType, string> = {
  inhale:       'Inspirez',
  hold:         'Retenez',
  exhale:       'Expirez',
  recovery:     'Récupérez',
  ventilation:  'Ventilez',
}

// ── Sélection de voix ─────────────────────────────────────────────────────────

function scoreVoice(v: SpeechSynthesisVoice): number {
  if (!v.lang.startsWith('fr')) return -1
  let score = 0
  const name = v.name.toLowerCase()
  if (name.includes('google'))                                score += 100
  if (!v.localService)                                        score += 15
  if (v.lang === 'fr-FR')                                     score += 10
  if (v.lang === 'fr-CA')                                     score += 5
  if (name.includes('hortense'))                              score += 20
  if (name.includes('julie'))                                 score += 15
  if (name.includes('amélie') || name.includes('amelie'))     score += 18
  if (name.includes('thomas'))                                score -= 10
  if (name.includes('premium') || name.includes('enhanced'))  score += 25
  if (name.includes('desktop'))                               score += 12
  if (name.includes('neural'))                                score += 20
  return score
}

// Cache module — partagé entre toutes les instances
let _cachedVoice: SpeechSynthesisVoice | null = null
let _cacheReady = false

function _selectBestVoice(): void {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -1
  for (const v of voices) {
    const s = scoreVoice(v)
    if (s > bestScore) { bestScore = s; best = v }
  }
  _cachedVoice = best
}

function _initVoiceCache(): void {
  if (_cacheReady) return
  _cacheReady = true
  _selectBestVoice()
  window.speechSynthesis.addEventListener('voiceschanged', _selectBestVoice)
}

/** Infos sur la voix actuellement sélectionnée (debug / réglages). */
export function getSelectedVoiceInfo(): { name: string; lang: string; local: boolean } | null {
  if (!_cachedVoice) return null
  return { name: _cachedVoice.name, lang: _cachedVoice.lang, local: _cachedVoice.localService }
}

/** Liste toutes les voix françaises disponibles avec leur score. */
export function listFrenchVoices(): Array<{ name: string; lang: string; local: boolean; score: number }> {
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith('fr'))
    .map((v) => ({ name: v.name, lang: v.lang, local: v.localService, score: scoreVoice(v) }))
    .sort((a, b) => b.score - a.score)
}

// ── Description d'exercice ────────────────────────────────────────────────────

/**
 * Formate une durée en secondes en français naturel pour le TTS.
 *   4   → "4 secondes"
 *   1   → "1 seconde"
 *   5.5 → "5 secondes et demi"
 *   2.5 → "2 secondes et demi"
 *   0.5 → "une demi-seconde"
 *   3.3 → "3,3 secondes"   (virgule française — TTS dit "trois virgule trois")
 */
function formatSeconds(sec: number): string {
  if (sec === 0.5) return 'une demi-seconde'
  if (sec % 1 === 0.5) {
    const whole = Math.floor(sec)
    return whole === 1 ? '1 seconde et demi' : `${whole} secondes et demi`
  }
  if (Number.isInteger(sec)) {
    return sec === 1 ? '1 seconde' : `${sec} secondes`
  }
  // Autre décimal : virgule française
  return `${sec.toFixed(1).replace('.', ',')} secondes`
}

/**
 * Construit le texte de description de l'exercice prononcé pendant la préparation.
 * Fonctionne pour tous les exercices (presets et custom).
 *
 * Exemples :
 *   "Inspirez 4 secondes, retenez 7 secondes, expirez 8 secondes. 3 répétitions."
 *   "Inspirez 5 secondes et demi, retenez 5 secondes et demi, expirez 5 secondes et demi,
 *    retenez 5 secondes et demi. 14 répétitions."
 *   "Inspirez 4 secondes, retenez 4 secondes, expirez 4 secondes, retenez 4 secondes.
 *    5 répétitions. 10 secondes de récupération entre chaque cycle."
 */
export function buildPreparationText(exercise: Exercise): string {
  // Sécurité : si l'exercice n'a pas de phases valides, on parle quand même
  const activePhrases = (exercise.phases ?? [])
    .filter((p) => p.type !== 'recovery')
    .map((p) => {
      const label = PHASE_LABEL[p.type] ?? p.type
      return `${label} ${formatSeconds(p.durationSeconds)}`
    })

  if (!activePhrases.length) return 'Préparez-vous.'

  const parts: string[] = [activePhrases.join(', ') + '.']

  if ((exercise.repetitions ?? 1) > 1) {
    parts.push(`${exercise.repetitions} répétitions.`)
  }

  if ((exercise.restBetweenRepsSeconds ?? 0) > 0) {
    parts.push(`${formatSeconds(exercise.restBetweenRepsSeconds)} de récupération entre chaque cycle.`)
  }

  return parts.join(' ')
}

/**
 * Estime la durée en secondes de la description vocale de l'exercice.
 * Basé sur le débit de parole (130 mots/min à rate=1.0 pour le français).
 * Ajoute 2 s de marge pour les pauses naturelles.
 * Minimum : 5 s.
 */
export function estimatePreparationDuration(exercise: Exercise, rate: number): number {
  const text        = buildPreparationText(exercise)
  const wordCount   = text.trim().split(/\s+/).length
  // 130 mots/min à rate=1.0 → wordsPerSec = 130 × rate / 60
  const wordsPerSec = (130 * rate) / 60
  return Math.max(5, Math.ceil(wordCount / wordsPerSec + 2))
}

// ── Classe principale ─────────────────────────────────────────────────────────

export class BreathVoiceGuide {
  private settings: VoiceGuideSettings
  private readonly supported: boolean
  private exercise: Exercise | null = null

  constructor(settings: VoiceGuideSettings) {
    this.settings  = settings
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window
    if (this.supported) _initVoiceCache()
  }

  /**
   * Associe l'exercice courant — utilisé pour construire le texte de préparation.
   * À appeler avant le démarrage de la session.
   */
  setExercise(exercise: Exercise): void {
    this.exercise = exercise
  }

  speak(phase: InternalPhaseType): void {
    if (!this.settings.enabled || !this.supported) return
    const text = phase === 'preparation' && this.exercise
      ? buildPreparationText(this.exercise)
      : PHASE_WORD[phase]
    if (!text) return
    this._sayText(text)
  }

  /**
   * Prononce un texte libre — pour les phases custom dont le label
   * ne correspond pas à un InternalPhaseType standard (ex. "Ventilation").
   */
  speakText(text: string): void {
    if (!this.settings.enabled || !this.supported || !text) return
    this._sayText(text)
  }

  private _sayText(text: string): void {
    try {
      const synth = window.speechSynthesis

      // ── Bug iOS Chrome : cancel() + speak() immédiat gèle la queue ─────────
      // Solution : toujours passer par setTimeout(50ms) pour laisser iOS
      // terminer l'annulation avant de soumettre le nouvel énoncé.
      if (synth.paused) synth.resume()
      synth.cancel()

      const settings = this.settings   // capture pour le closure
      const voice    = _cachedVoice

      window.setTimeout(() => {
        try {
          if (synth.paused) synth.resume()
          const u  = new SpeechSynthesisUtterance(text)
          u.lang   = 'fr-FR'
          u.volume = settings.volume
          u.rate   = settings.rate
          u.pitch  = settings.pitch   // ignoré par Google TTS
          if (voice) u.voice = voice
          synth.speak(u)
        } catch { /* silencieux */ }
      }, 50)
    } catch { /* silencieux */ }
  }

  setEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, enabled }
    if (!enabled) this.cancel()
  }

  cancel(): void {
    if (!this.supported) return
    try { window.speechSynthesis.cancel() } catch { /* silencieux */ }
  }
}
