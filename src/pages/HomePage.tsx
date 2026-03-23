import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ArrowRight } from 'lucide-react'
import { PageContainer } from '@modules/theme'
import { useSettingsStore } from '@modules/settings'
import { useExerciseStore, getAllExercises, seedPresets, FavoriteCard } from '@modules/exercises'
import type { Exercise } from '@core/types'

// ── Home page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { settings, load: loadSettings, isLoading: settingsLoading, moveFavorite } = useSettingsStore()
  const { exercises, setExercises, isLoading: exercisesLoading } = useExerciseStore()
  const [reorderMode, setReorderMode] = useState(false)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

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

  const isLoading = settingsLoading || exercisesLoading

  // Garde défensive : exclut les IDs masqués ou supprimés.
  // Un favori ne peut référencer qu'un exercice existant et visible.
  const hiddenPresetIds = settings.hiddenPresetIds ?? []
  const favorites = settings.favoriteExerciseIds
    .filter((id) => !hiddenPresetIds.includes(id))
    .map((id) => exercises.find((ex) => ex.id === id))
    .filter((ex): ex is Exercise => ex !== undefined)

  return (
    <PageContainer
      title="Accueil"
      subtitle="Vos exercices favoris"
      actions={
        favorites.length > 1 ? (
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
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="card h-28 animate-pulse-soft" />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <EmptyFavorites />
      ) : (
        <div className="space-y-3">
          {favorites.map((ex, idx) => (
            <FavoriteCard
              key={ex.id}
              exercise={ex}
              isFirst={idx === 0}
              isLast={idx === favorites.length - 1}
              reorderMode={reorderMode}
              onMoveUp={() => void moveFavorite(ex.id, 'up')}
              onMoveDown={() => void moveFavorite(ex.id, 'down')}
            />
          ))}
          {!reorderMode && (
            <Link
              to="/exercises"
              className="flex items-center justify-center gap-1.5 py-3 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Voir tous les exercices
              <ArrowRight size={13} />
            </Link>
          )}
        </div>
      )}
    </PageContainer>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyFavorites() {
  return (
    <div className="card p-5 flex flex-col items-center gap-3 text-center">
      <Heart size={18} className="text-text-muted" />
      <div>
        <p className="text-xs font-medium text-text-primary">Aucun favori</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Ajoutez des exercices en favoris pour les retrouver ici.
        </p>
      </div>
      <Link
        to="/exercises"
        className="flex items-center gap-1 text-xs text-accent hover:opacity-80 transition-opacity"
      >
        Explorer les exercices
        <ArrowRight size={12} />
      </Link>
    </div>
  )
}
