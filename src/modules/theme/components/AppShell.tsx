import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'

/**
 * Shell de l'application — layout responsive :
 * - Mobile  : nav en bas
 * - Desktop (≥ 1024px) : nav latérale gauche
 */
export function AppShell() {
  return (
    <div className="flex h-dvh bg-bg-base">
      {/* Nav latérale desktop */}
      <SideNav />

      {/* Contenu principal */}
      <main className="flex-1 min-h-0 overflow-y-auto lg:ml-[var(--nav-width-side)]">
        <div className="mx-auto max-w-2xl px-4 pb-[calc(var(--nav-height-bottom)+var(--safe-bottom))] pt-[var(--safe-top)] lg:pb-8 lg:pt-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Nav bottom mobile */}
      <BottomNav />
    </div>
  )
}
