import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Heart, ArrowRight } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { useSettingsStore } from '@modules/settings'
import { useExerciseStore, getAllExercises, seedPresets, FavoriteCard } from '@modules/exercises'
import { tableRepository } from '@modules/apnea-tables/services/tableRepository'
import { TableFavoriteCard } from '@modules/apnea-tables/components/TableFavoriteCard'
import { getAllCustomWarmups } from '@modules/free-timer/services/customWarmupWriter'
import { WarmupFavoriteCard } from '@modules/free-timer/components/WarmupFavoriteCard'
import type { Exercise, ExerciseCategory } from '@core/types'
import type { ApneaTable } from '@modules/apnea-tables/types'
import type { CustomWarmup } from '@modules/free-timer/types/index'

type FilterTab = 'all' | 'exercises' | 'tables' | 'warmups'
type CategoryFilter = ExerciseCategory | 'all'

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  breathing:     'Respiration',
  apnea:         'Apnee',
  visualization: 'Visualisation',
  preparation:   'Preparation',
  meditation:    'Meditation',
  panic:         'Panique',
  warmup:        'Echauffement',
  custom:        'Perso',
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Extrait la catégorie d'un favori (quel que soit le type) */
function getCategory(item: Exercise | ApneaTable | CustomWarmup): ExerciseCategory | undefined {
  if ('category' in item) return item.category as ExerciseCategory | undefined
  return undefined
}

// ── Home page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const { settings, load: loadSettings, isLoading: settingsLoading, moveFavorite, moveTableFavorite, moveWarmupFavorite } = useSettingsStore()
  const { exercises, setExercises, isLoading: exercisesLoading } = useExerciseStore()
  const [tables,      setTables]      = useState<ApneaTable[]>([])
  const [warmups,     setWarmups]     = useState<CustomWarmup[]>([])
  const [tab,         setTab]         = useState<FilterTab>('all')
  const [catFilter,   setCatFilter]   = useState<CategoryFilter>('all')
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

  // ── Résolution des favoris par ID ───────────────────────────────────────────

  const hiddenPresetIds = settings.hiddenPresetIds ?? []

  const favExercisesAll = useMemo(() =>
    (settings.favoriteExerciseIds ?? [])
      .filter((id) => !hiddenPresetIds.includes(id))
      .map((id) => exercises.find((ex) => ex.id === id))
      .filter((ex): ex is Exercise => ex !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.favoriteExerciseIds, settings.hiddenPresetIds, exercises],
  )

  const favTablesAll = useMemo(() =>
    (settings.favoriteTableIds ?? [])
      .map((id) => tables.find((t) => t.id === id))
      .filter((t): t is ApneaTable => t !== undefined),
    [settings.favoriteTableIds, tables],
  )

  const favWarmupsAll = useMemo(() =>
    (settings.favoriteWarmupIds ?? [])
      .map((id) => warmups.find((w) => w.id === id))
      .filter((w): w is CustomWarmup => w !== undefined),
    [settings.favoriteWarmupIds, warmups],
  )

  // ── Catégories présentes dans les favoris (pour n'afficher que les filtres utiles) ──

  const availableCategories = useMemo(() => {
    const cats = new Set<ExerciseCategory>()
    for (const ex of favExercisesAll) cats.add(ex.category)
    for (const t  of favTablesAll)    if (t.category) cats.add(t.category)
    for (const w  of favWarmupsAll)   if (w.category) cats.add(w.category)
    return cats
  }, [favExercisesAll, favTablesAll, favWarmupsAll])

  // ── Filtrage par catégorie ──────────────────────────────────────────────────

  const matchesCat = (item: Exercise | ApneaTable | CustomWarmup): boolean => {
    if (catFilter === 'all') return true
    return getCategory(item) === catFilter
  }

  const favExercises = catFilter === 'all' ? favExercisesAll : favExercisesAll.filter(matchesCat)
  const favTables    = catFilter === 'all' ? favTablesAll    : favTablesAll.filter(matchesCat)
  const favWarmups   = catFilter === 'all' ? favWarmupsAll   : favWarmupsAll.filter(matchesCat)

  const totalFavs    = favExercisesAll.length + favTablesAll.length + favWarmupsAll.length
  const filteredCount = favExercises.length + favTables.length + favWarmups.length

  const activeList = tab === 'exercises' ? favExercises
    : tab === 'tables' ? favTables
    : tab === 'warmups' ? favWarmups
    : null

  function handleTabChange(newTab: FilterTab) {
    setTab(newTab)
    setReorderMode(false)
  }

  function handleCatChange(newCat: CategoryFilter) {
    setCatFilter(newCat)
    setReorderMode(false)
  }

  const showReorderButton = tab !== 'all' && (activeList?.length ?? 0) > 1

  // Détermine si le tab warmups est vide (avec filtre catégorie appliqué)
  const warmupTabEmpty = favWarmups.length === 0 && favExercises.filter(e => e.category === 'warmup').length === 0 && favTables.filter(t => t.category === 'warmup').length === 0

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
            {reorderMode ? 'Terminer' : 'Reorganiser'}
          </button>
        ) : undefined
      }
    >
      {/* ── Type tabs ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-2 overflow-x-auto pb-0.5 scrollbar-none">
        {([
          { key: 'all',       label: 'Tous' },
          { key: 'exercises', label: 'Exercices' },
          { key: 'tables',    label: 'Tables' },
          { key: 'warmups',   label: 'Echauffements' },
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

      {/* ── Category filter (affiché uniquement si > 1 catégorie) ──────── */}
      {availableCategories.size > 1 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            onClick={() => handleCatChange('all')}
            className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              catFilter === 'all'
                ? 'bg-text-secondary text-bg-base'
                : 'bg-bg-elevated/60 text-text-muted hover:bg-bg-overlay'
            }`}
          >
            Toutes
          </button>
          {([...availableCategories].sort() as ExerciseCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => handleCatChange(cat)}
              className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                catFilter === cat
                  ? 'bg-text-secondary text-bg-base'
                  : 'bg-bg-elevated/60 text-text-muted hover:bg-bg-overlay'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="card h-28 animate-pulse-soft" />
          ))}
        </div>
      ) : totalFavs === 0 ? (
        <EmptyFavorites />
      ) : filteredCount === 0 ? (
        <div className="card p-5 flex flex-col items-center gap-3 text-center">
          <Heart size={18} className="text-text-muted" />
          <p className="text-xs text-text-muted">Aucun favori dans cette categorie</p>
          <button
            onClick={() => setCatFilter('all')}
            className="text-xs text-accent hover:opacity-80 transition-opacity"
          >
            Voir tous les favoris
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Exercises section */}
          {(() => {
            const show = (tab === 'all' || tab === 'exercises') && favExercises.length > 0
            return show ? (
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
            ) : null
          })()}

          {/* Tables section */}
          {(() => {
            const show = (tab === 'all' || tab === 'tables') && favTables.length > 0
            return show ? (
              <>
                {tab === 'all' && <SectionHeader label="Tables Apnee" to="/tables" />}
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
            ) : null
          })()}

          {/* Warmups section (CustomWarmup) */}
          {(tab === 'all' || tab === 'warmups') && favWarmups.length > 0 && (
            <>
              {tab === 'all' && <SectionHeader label="Echauffements" to="/timer" />}
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
          {tab !== 'all' && (tab === 'warmups' ? warmupTabEmpty : (activeList?.length ?? 0) === 0) && (
            <EmptyFilteredTab tab={tab} />
          )}

          {!reorderMode && tab === 'all' && favExercises.length === 0 && catFilter === 'all' && (
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
    warmups:   { label: 'Voir les echauffements',  to: '/timer' },
  }
  const { label, to } = links[tab]
  return (
    <div className="card p-5 flex flex-col items-center gap-3 text-center">
      <Heart size={18} className="text-text-muted" />
      <p className="text-xs text-text-muted">Aucun favori dans cette categorie</p>
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
          Ajoutez des exercices, tables ou echauffements en favoris.
        </p>
      </div>
      <Link to="/exercises" className="flex items-center gap-1 text-xs text-accent hover:opacity-80 transition-opacity">
        Explorer les exercices <ArrowRight size={12} />
      </Link>
    </div>
  )
}
