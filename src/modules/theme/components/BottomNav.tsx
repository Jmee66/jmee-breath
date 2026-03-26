import { NavLink } from 'react-router-dom'
import { Home, Wind, Timer, Layers, Settings } from 'lucide-react'

const navItems = [
  { to: '/',          icon: Home,     label: 'Accueil'   },
  { to: '/exercises', icon: Wind,     label: 'Exercices' },
  { to: '/timer',     icon: Timer,    label: 'Timer'     },
  { to: '/tables',    icon: Layers,   label: 'Tables'    },
  { to: '/settings',  icon: Settings, label: 'Réglages'  },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border safe-bottom lg:hidden"
      style={{ height: 'calc(var(--nav-height-bottom) + var(--safe-bottom))' }}
    >
      <div className="flex h-[var(--nav-height-bottom)] items-center justify-around px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${
                isActive
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              }`
            }
          >
            <Icon size={22} strokeWidth={1.5} />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
