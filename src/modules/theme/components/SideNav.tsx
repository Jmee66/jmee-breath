import { NavLink } from 'react-router-dom'
import {
  Home, BookOpen, BarChart2, Wind, Brain,
  Timer, User, Settings, LogOut,
} from 'lucide-react'
import { signOut } from '@modules/auth'

const mainItems = [
  { to: '/',          icon: Home,      label: 'Accueil' },
  { to: '/journal',   icon: BookOpen,  label: 'Journal' },
  { to: '/stats',     icon: BarChart2, label: 'Statistiques' },
  { to: '/exercises', icon: Wind,      label: 'Exercices' },
  { to: '/coach',     icon: Brain,     label: 'Coach IA' },
  { to: '/timer',     icon: Timer,     label: 'Timer libre' },
]

const bottomItems = [
  { to: '/profile',  icon: User,     label: 'Profil' },
  { to: '/settings', icon: Settings, label: 'Réglages' },
]

export function SideNav() {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[var(--nav-width-side)] flex-col border-r border-border bg-bg-surface lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <span className="text-lg font-semibold tracking-tight text-text-primary">
          Apnea<span className="text-accent">.</span>
        </span>
      </div>

      {/* Nav principale */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {mainItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-dim text-accent'
                      : 'text-text-secondary hover:bg-bg-overlay hover:text-text-primary'
                  }`
                }
              >
                <Icon size={18} strokeWidth={1.5} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Nav bas */}
      <div className="border-t border-border px-3 py-3">
        <ul className="space-y-1">
          {bottomItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-dim text-accent'
                      : 'text-text-secondary hover:bg-bg-overlay hover:text-text-primary'
                  }`
                }
              >
                <Icon size={18} strokeWidth={1.5} />
                {label}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              onClick={() => void signOut()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg-overlay hover:text-status-error"
            >
              <LogOut size={18} strokeWidth={1.5} />
              Déconnexion
            </button>
          </li>
        </ul>
      </div>
    </aside>
  )
}
