/**
 * BreathVoiceGuide — guidage vocal méditatif.
 *
 * Classe pure TypeScript — aucun import React.
 * Utilise la Web Speech API (SpeechSynthesis) pour annoncer
 * chaque phase respiratoire d'une voix douce et posée.
 *
 * Cross-platform :
 *  - getVoices() est asynchrone sur iOS/Chrome : on pré-charge les voix
 *    dans le constructeur via l'événement voiceschanged et on les met en
 *    cache pour que speak() les trouve immédiatement.
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
// null = phase silencieuse
const PHASE_TEXT: Record<InternalPhaseType, string | null> = {
  preparation:  'Préparez-vous',
  inhale:       'Inspirez',
  'hold-full':  'Retenez',
  exhale:       'Expirez',
  'hold-empty': 'Retenez',
  recovery:     'Récupérez',
}

// ─────────────────────────────────────────────────────────────────────────────

export class BreathVoiceGuide {
  private readonly settings: VoiceGuideSettings
  private supported: boolean
  /** Cache des voix françaises — alimenté dès que le navigateur les charge. */
  private cachedFrVoice: SpeechSynthesisVoice | null = null

  constructor(settings: VoiceGuideSettings) {
    this.settings = settings
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window

    if (this.supported) {
      // Premier appel synchrone : peut retourner [] sur iOS/Chrome au cold start
      this.cacheVoice(window.speechSynthesis.getVoices())

      // voiceschanged se déclenche quand le navigateur a chargé la liste complète
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this.cacheVoice(window.speechSynthesis.getVoices())
      })
    }
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

      const utterance      = new SpeechSynthesisUtterance(text)
      utterance.lang       = 'fr-FR'
      utterance.volume     = this.settings.volume
      utterance.rate       = this.settings.rate
      utterance.pitch      = 0.55  // grave et posé — voix méditative profonde

      // Voix française en cache (chargée de façon asynchrone au démarrage)
      if (this.cachedFrVoice) utterance.voice = this.cachedFrVoice

      synth.speak(utterance)
    } catch {
      // speechSynthesis peut être bloqué sur certains contextes (iOS Safari strict)
    }
  }

  cancel(): void {
    if (!this.supported) return
    try { window.speechSynthesis.cancel() } catch { /* silencieux */ }
  }

  // ── Privé ────────────────────────────────────────────────────────────────

  private cacheVoice(voices: SpeechSynthesisVoice[]): void {
    if (!voices.length) return
    // Préfère une voix locale française (non-Google) — meilleure sur iOS
    this.cachedFrVoice =
      voices.find((v) => v.lang.startsWith('fr') && !v.name.toLowerCase().includes('google')) ??
      voices.find((v) => v.lang.startsWith('fr')) ??
      null
  }
}
