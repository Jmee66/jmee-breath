import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Heart, ArrowRight } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { useSettingsStore } from '@modules/settings'
import { useExerciseStore, getAllExercises, seedPresets, FavoriteCard } from '@modules/exercises'
import { tableRepository } from '@modules/apnea-tables/services/tableRepository'
import { TableFavoriteCard } from '@modules/apnea-tables/components/TableFavoriteCard'
import { getAllCustomWarmups } from '@modules/free-timer/services/customWarmupWriter'
import { WarmupFavoriteCard } from '@modules/free-timer/components/WarmupFavoriteCard'
import type { Exercise } from '@core/types'
import type { ApneaTable } from '@modules/apnea-tables/types'
import type { CustomWarmup } from '@modules/free-timer/types/index'

type FilterTab = 'all' | 'exercises' | 'tables' | 'warmups'

// ── Home page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const { settings, load: loadSettings, isLoading: settingsLoading, moveFavorite, moveTableFavorite, moveWarmupFavorite } = useSettingsStore()
  const { exercises, setExercises, isLoading: exercisesLoading } = useExerciseStore()
  const [tables,      setTables]      = useState<ApneaTable[]>([])
  const [warmups,     setWarmups]     = useState<CustomWarmup[]>([])
  const [tab,         setTab]         = useState<FilterTab>('all')
  const [reorderMode, setReorderMode] = useState(false)

  useEffect(() => { void loadSettings() }, [loadSettings])

  useEffect(() => {
    if (exercises.length === 0) {
      async function load() {
        await seedPresets()
        const all = await getAllExercises()
        setExercises(all)
      }
      void load()
    }
  }, [exercises.length, setExercises])

  useEffect(() => {
    tableRepository.getAll().then(setTables).catch(() => {})
    getAllCustomWarmups().then(setWarmups).catch(() => {})
  }, [])

  const isLoading = settingsLoading || exercisesLoading

  const hiddenPresetIds = settings.hiddenPresetIds ?? []
  const favExercises = (settings.favoriteExerciseIds ?? [])
    .filter((id) => !hiddenPresetIds.includes(id))
    .map((id) => exercises.find((ex) => ex.id === id))
    .filter((ex): ex is Exercise => ex !== undefined)

  const favTables = (settings.favoriteTableIds ?? [])
    .map((id) => tables.find((t) => t.id === id))
    .filter((t): t is ApneaTable => t !== undefined)

  const favWarmups = (settings.favoriteWarmupIds ?? [])
    .map((id) => warmups.find((w) => w.id === id))
    .filter((w): w is CustomWarmup => w !== undefined)

  const totalFavs = favExercises.length + favTables.length + favWarmups.length

  const activeList = tab === 'exercises' ? favExercises
    : tab === 'tables' ? favTables
    : tab === 'warmups' ? favWarmups
    : null

  function handleTabChange(newTab: FilterTab) {
    setTab(newTab)
    setReorderMode(false)
  }

  const showReorderButton = tab !== 'all' && (activeList?.length ?? 0) > 1

  return (
    <PageContainer
      title="Accueil"
      subtitle="Vos favoris"
      actions={
        showReorderButton ? (
          <button
            onClick={() => setReorderMode((v) => !v)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              reorderMode
                ? 'bg-accent text-text-inverse'
                : 'bg-bg-elevated text-text-secondary hover:bg-bg-overlay'
            }`}
          >
            {reorderMode ? 'Terminer' : 'Réorganiser'}
          </button>
        ) : undefined
      }
    >
      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-0.5 scrollbar-none">
        {([
          { key: 'all',       label: 'Tous' },
          { key: 'exercises', label: 'Exercices' },
          { key: 'tables',    label: 'Tables' },
          { key: 'warmups',   label: 'Échauffements' },
        ] as { key: FilterTab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-accent text-text-inverse'
                : 'bg-bg-elevated text-text-secondary hover:bg-bg-overlay'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="card h-28 animate-pulse-soft" />
          ))}
        </div>
      ) : totalFavs === 0 ? (
        <EmptyFavorites />
      ) : (
        <div className="space-y-3">
          {/* Exercises section */}
          {(tab === 'all' || tab === 'exercises') && favExercises.length > 0 && (
            <>
              {tab === 'all' && <SectionHeader label="Exercices" to="/exercises" />}
              {favExercises.map((ex, idx) => (
                <FavoriteCard
                  key={ex.id}
                  exercise={ex}
                  isFirst={idx === 0}
                  isLast={idx === favExercises.length - 1}
                  reorderMode={reorderMode && tab === 'exercises'}
                  onMoveUp={() => void moveFavorite(ex.id, 'up')}
                  onMoveDown={() => void moveFavorite(ex.id, 'down')}
                />
              ))}
            </>
          )}

          {/* Tables section */}
          {(tab === 'all' || tab === 'tables') && favTables.length > 0 && (
            <>
              {tab === 'all' && <SectionHeader label="Tables Apnée" to="/tables" />}
              {favTables.map((t, idx) => (
                <TableFavoriteCard
                  key={t.id}
                  table={t}
                  isFirst={idx === 0}
                  isLast={idx === favTables.length - 1}
                  reorderMode={reorderMode && tab === 'tables'}
                  onRun={() => navigate('/tables')}
                  onMoveUp={() => void moveTableFavorite(t.id, 'up')}
                  onMoveDown={() => void moveTableFavorite(t.id, 'down')}
                />
              ))}
            </>
          )}

          {/* Warmups section */}
          {(tab === 'all' || tab === 'warmups') && favWarmups.length > 0 && (
            <>
              {tab === 'all' && <SectionHeader label="Échauffements" to="/timer" />}
              {favWarmups.map((w, idx) => (
                <WarmupFavoriteCard
                  key={w.id}
                  warmup={w}
                  isFirst={idx === 0}
                  isLast={idx === favWarmups.length - 1}
                  reorderMode={reorderMode && tab === 'warmups'}
                  onStart={() => navigate('/timer')}
                  onMoveUp={() => void moveWarmupFavorite(w.id, 'up')}
                  onMoveDown={() => void moveWarmupFavorite(w.id, 'down')}
                />
              ))}
            </>
          )}

          {/* Empty filtered tab */}
          {tab !== 'all' && (activeList?.length ?? 0) === 0 && (
            <EmptyFilteredTab tab={tab} />
          )}

          {!reorderMode && tab === 'all' && favExercises.length === 0 && (
            <div className="pt-1">
              <Link to="/exercises" className="flex items-center justify-center gap-1.5 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors">
                Explorer les exercices <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ label, to }: { label: string; to: string }) {
  return (
    <div className="flex items-center justify-between pt-1 pb-0.5">
      <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</span>
      <Link to={to} className="text-[11px] text-text-secondary hover:text-accent transition-colors flex items-center gap-0.5">
        Voir tout <ArrowRight size={10} />
      </Link>
    </div>
  )
}

function EmptyFilteredTab({ tab }: { tab: FilterTab }) {
  const links: Record<FilterTab, { label: string; to: string }> = {
    all:       { label: 'Explorer',               to: '/exercises' },
    exercises: { label: 'Explorer les exercices',  to: '/exercises' },
    tables:    { label: 'Voir les tables',          to: '/tables' },
    warmups:   { label: 'Voir les échauffements',  to: '/timer' },
  }
  const { label, to } = links[tab]
  return (
    <div className="card p-5 flex flex-col items-center gap-3 text-center">
      <Heart size={18} className="text-text-muted" />
      <p className="text-xs text-text-muted">Aucun favori dans cette catégorie</p>
      <Link to={to} className="flex items-center gap-1 text-xs text-accent hover:opacity-80 transition-opacity">
        {label} <ArrowRight size={12} />
      </Link>
    </div>
  )
}

function EmptyFavorites() {
  return (
    <div className="card p-5 flex flex-col items-center gap-3 text-center">
      <Heart size={18} className="text-text-muted" />
      <div>
        <p className="text-xs font-medium text-text-primary">Aucun favori</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Ajoutez des exercices, tables ou échauffements en favoris.
        </p>
      </div>
      <Link to="/exercises" className="flex items-center gap-1 text-xs text-accent hover:opacity-80 transition-opacity">
        Explorer les exercices <ArrowRight size={12} />
      </Link>
    </div>
  )
}
