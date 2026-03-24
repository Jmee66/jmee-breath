import { useNavigate } from 'react-router-dom'
import { LogIn, LogOut, UserPlus, User } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { useAuthStore } from '@modules/auth/store/authStore'
import { signOut } from '@modules/auth/services/authService'

export default function ProfilePageRoute() {
  const navigate  = useNavigate()
  const user      = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  if (isLoading) {
    return (
      <PageContainer title="Profil">
        <div className="flex justify-center pt-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </PageContainer>
    )
  }

  // ── Connecté ────────────────────────────────────────────────────────────────
  if (user) {
    return (
      <PageContainer title="Profil">
        <div className="space-y-4">

          {/* Carte utilisateur */}
          <div className="card p-6 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/20">
              <User size={26} className="text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{user.email}</p>
              <p className="text-xs text-text-muted mt-0.5">Compte synchronisé</p>
            </div>
          </div>

          {/* Infos sync */}
          <div className="card p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Synchronisation active
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Tes réglages, exercices, favoris et sessions sont synchronisés
              sur tous tes appareils connectés à ce compte.
            </p>
          </div>

          {/* Déconnexion */}
          <button
            onClick={() => void handleSignOut()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-3.5 text-sm font-medium text-text-secondary hover:bg-bg-elevated hover:text-status-error transition-colors active:scale-95"
          >
            <LogOut size={16} />
            Se déconnecter
          </button>

        </div>
      </PageContainer>
    )
  }

  // ── Non connecté ────────────────────────────────────────────────────────────
  return (
    <PageContainer title="Profil">
      <div className="space-y-4 pt-2">

        <div className="card p-5 text-center space-y-2">
          <p className="text-sm font-medium text-text-primary">
            Synchronise ton app sur tous tes appareils
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            Réglages, exercices, favoris et sessions — toujours disponibles sur iPhone, ordi et tablette.
          </p>
        </div>

        <button
          onClick={() => navigate('/login')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-base font-semibold text-text-inverse hover:opacity-90 active:scale-95 transition-all"
        >
          <LogIn size={18} />
          Se connecter
        </button>

        <button
          onClick={() => navigate('/signup')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border py-4 text-base font-medium text-text-secondary hover:bg-bg-elevated active:scale-95 transition-all"
        >
          <UserPlus size={18} />
          Créer un compte
        </button>

      </div>
    </PageContainer>
  )
}
