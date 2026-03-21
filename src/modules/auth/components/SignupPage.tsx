import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signUp } from '../services/authService'

export function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    const { error: authError } = await signUp(email, password)
    setIsLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-bg-base px-6 text-center">
        <p className="text-lg text-status-success">Compte créé !</p>
        <p className="mt-2 text-sm text-text-secondary">Vérifie ton email pour confirmer ton compte.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg-base px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-text-primary">Créer un compte</h1>
          <p className="mt-2 text-sm text-text-secondary">Rejoindre Apnea Trainer</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-text-secondary">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg-surface px-4 py-3 text-text-primary outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-text-secondary">Mot de passe</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg-surface px-4 py-3 text-text-primary outline-none focus:border-accent transition-colors"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-950/40 px-4 py-3 text-sm text-status-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-accent py-3 font-medium text-text-inverse transition-opacity disabled:opacity-50"
          >
            {isLoading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-center text-sm text-text-secondary">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}
