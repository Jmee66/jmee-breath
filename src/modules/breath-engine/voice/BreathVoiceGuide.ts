/**
 * BreathVoiceGuide — guidage vocal méditatif.
 *
 * Classe pure TypeScript — aucun import React.
 * Utilise la Web Speech API (SpeechSynthesis) pour annoncer
 * chaque phase respiratoire d'une voix douce et posée.
 *
 * Cross-platform :
 *  - getVoices() est asynchrone sur iOS/Chrome : le cache de voix est
 *    initialisé au niveau MODULE (une seule fois, pas par instance) via
 *    l'événement voiceschanged. Évite l'accumulation de listeners et la
 *    fuite mémoire qui survenait quand un nouveau BreathVoiceGuide était
 *    créé à chaque session.
 *  - Bug iOS : speechSynthesis peut rester coincé en état "paused" sans
 *    intervention de l'app → on appelle resume() avant chaque speak().
 *  - Pas de Google TTS sur iOS (indisponible) — on préfère la voix native.
 */

import type { InternalPhaseType } from '../clock/types'

export interface VoiceGuideSettings {
  enabled: boolean
  /** Volume 0–1 */
  volume: number
  /** Débit de parole — 0.5 (méditatif) → 1.0 (normal) */
  rate: number
}

// ── Texte par phase ───────────────────────────────────────────────────────────
const PHASE_TEXT: Record<InternalPhaseType, string | null> = {
  preparation:  'Préparez-vous',
  inhale:       'Inspirez',
  'hold-full':  'Retenez',
  exhale:       'Expirez',
  'hold-empty': 'Retenez',
  recovery:     'Récupérez',
}

// ── Cache des voix — niveau module ────────────────────────────────────────────
// Partagé entre toutes les instances : le listener voiceschanged n'est
// enregistré qu'une seule fois, quelle que soit le nombre de sessions.
let _cachedFrVoice: SpeechSynthesisVoice | null = null
let _voiceCacheInitialized = false

function _initVoiceCache(): void {
  if (_voiceCacheInitialized) return
  _voiceCacheInitialized = true

  const tryCache = () => {
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return
    _cachedFrVoice =
      voices.find((v) => v.lang.startsWith('fr') && !v.name.toLowerCase().includes('google')) ??
      voices.find((v) => v.lang.startsWith('fr')) ??
      null
  }

  // Tentative synchrone (disponible sur Firefox et Chrome desktop)
  tryCache()
  // voiceschanged se déclenche quand le navigateur a chargé la liste (iOS/Chrome mobile)
  window.speechSynthesis.addEventListener('voiceschanged', tryCache)
}

// ─────────────────────────────────────────────────────────────────────────────

export class BreathVoiceGuide {
  private readonly settings: VoiceGuideSettings
  private readonly supported: boolean

  constructor(settings: VoiceGuideSettings) {
    this.settings  = settings
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window

    // Initialise le cache des voix (no-op si déjà fait lors d'une session précédente)
    if (this.supported) _initVoiceCache()
  }

  speak(phase: InternalPhaseType): void {
    if (!this.settings.enabled || !this.supported) return
    const text = PHASE_TEXT[phase]
    if (!text) return

    try {
      const synth = window.speechSynthesis

      // Bug iOS : la synthèse peut rester coincée en état "paused" sans raison.
      // Un resume() préventif débloque la file sans effet de bord si elle tourne.
      if (synth.paused) synth.resume()

      // Annule toute parole en cours pour ne pas empiler les annonces
      synth.cancel()

      const utterance  = new SpeechSynthesisUtterance(text)
      utterance.lang   = 'fr-FR'
      utterance.volume = this.settings.volume
      utterance.rate   = this.settings.rate
      utterance.pitch  = 0.55  // grave et posé — voix méditative profonde

      // Voix française en cache partagé (chargée lors de l'init module)
      if (_cachedFrVoice) utterance.voice = _cachedFrVoice

      synth.speak(utterance)
    } catch {
      // speechSynthesis peut être bloqué sur certains contextes (iOS Safari strict)
    }
  }

  cancel(): void {
    if (!this.supported) return
    try { window.speechSynthesis.cancel() } catch { /* silencieux */ }
  }
}
