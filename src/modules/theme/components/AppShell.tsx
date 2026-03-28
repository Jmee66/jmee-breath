import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'
import { GlobalSoundButton } from './GlobalSoundButton'
import { useRiverAmbience, useWindAmbience } from '@modules/breath-engine'
import { useSyncInit, usePreferencesSync } from '@core/sync'

/**
 * Shell de l'application — layout responsive :
 * - Mobile  : nav en bas
 * - Desktop (≥ 1024px) : nav latérale gauche
 */
export function AppShell() {
  useRiverAmbience()       // lecteur rivière global — actif hors session
  useWindAmbience()        // souffle synthétisé global — actif hors session
  useSyncInit()            // auth listener → syncManager.setUserId()
  usePreferencesSync()     // push/pull préférences ↔ Supabase

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

      {/* Bouton son global — flottant mobile uniquement (desktop = SideNav) */}
      <div className="lg:hidden">
        <GlobalSoundButton variant="floating" />
      </div>
    </div>
  )
}
