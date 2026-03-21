/**
 * BreathVoiceGuide — guidage vocal méditatif.
 *
 * Classe pure TypeScript — aucun import React.
 * Utilise la Web Speech API (SpeechSynthesis) pour annoncer
 * chaque phase respiratoire d'une voix douce et posée.
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

  constructor(settings: VoiceGuideSettings) {
    this.settings = settings
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  speak(phase: InternalPhaseType): void {
    if (!this.settings.enabled || !this.supported) return
    const text = PHASE_TEXT[phase]
    if (!text) return

    try {
      // Annule toute parole en cours pour ne pas empiler les annonces
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang    = 'fr-FR'
      utterance.volume  = this.settings.volume
      utterance.rate    = this.settings.rate
      utterance.pitch   = 0.55  // grave et posé — voix méditative profonde

      // Cherche une voix française si disponible
      const voices = window.speechSynthesis.getVoices()
      const frVoice = voices.find(
        (v) => v.lang.startsWith('fr') && !v.name.toLowerCase().includes('google')
      ) ?? voices.find((v) => v.lang.startsWith('fr'))
      if (frVoice) utterance.voice = frVoice

      window.speechSynthesis.speak(utterance)
    } catch {
      // speechSynthesis peut être bloqué sur certains contextes (iOS Safari strict)
    }
  }

  cancel(): void {
    if (!this.supported) return
    try { window.speechSynthesis.cancel() } catch { /* silencieux */ }
  }
}
