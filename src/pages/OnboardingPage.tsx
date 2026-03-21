import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOnboardingStore } from '@modules/onboarding'
import { eventBus } from '@core/events'

const LEVELS = [
  { id: 'beginner',     label: 'Débutant',     desc: 'Je commence l\'apnée' },
  { id: 'intermediate', label: 'Intermédiaire', desc: 'Quelques mois de pratique' },
  { id: 'advanced',     label: 'Avancé',        desc: 'Pratique régulière, > 2 min' },
  { id: 'expert',       label: 'Expert',        desc: 'Compétiteur ou instructeur' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { complete } = useOnboardingStore()
  const [step, setStep] = useState(0)
  const [level, setLevel] = useState('beginner')

  async function handleFinish() {
    await complete(level, 'fr-FR')
    eventBus.emit('ONBOARDING_COMPLETED', { level, language: 'fr-FR' })
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg-base safe-top safe-bottom">
      {step === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center space-y-8">
          <div className="space-y-3">
            <div className="text-4xl">🌊</div>
            <h1 className="text-2xl font-semibold text-text-primary">Bienvenue sur Apnea Trainer</h1>
          </div>

          <div className="card w-full max-w-sm p-5 text-left space-y-3">
            <p className="text-sm font-semibold text-status-warning">⚠️ Sécurité — Important</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>• Ne pratiquez <strong className="text-text-primary">jamais seul</strong></li>
              <li>• Toujours en présence d'un partenaire formé</li>
              <li>• Ne pratiquez pas en eau libre sans supervision</li>
              <li>• L'hyperventilation avant une apnée est <strong className="text-text-primary">dangereuse</strong></li>
              <li>• En cas de malaise, sortez immédiatement de l'eau</li>
            </ul>
          </div>

          <button
            onClick={() => setStep(1)}
            className="w-full max-w-sm rounded-xl bg-accent py-3 font-medium text-text-inverse"
          >
            J'ai compris — Continuer
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-1 flex-col items-center justify-center px-6 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-text-primary">Votre niveau</h2>
            <p className="text-sm text-text-secondary">Pour adapter les exercices et les conseils</p>
          </div>

          <div className="w-full max-w-sm space-y-3">
            {LEVELS.map(({ id, label, desc }) => (
              <button
                key={id}
                onClick={() => setLevel(id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  level === id
                    ? 'border-accent bg-accent-dim'
                    : 'border-border bg-bg-surface hover:bg-bg-overlay'
                }`}
              >
                <div className="font-medium text-text-primary">{label}</div>
                <div className="text-sm text-text-secondary">{desc}</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => void handleFinish()}
            className="w-full max-w-sm rounded-xl bg-accent py-3 font-medium text-text-inverse"
          >
            Commencer
          </button>
        </div>
      )}
    </div>
  )
}
