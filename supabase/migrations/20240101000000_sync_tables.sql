-- =============================================================================
-- Migration : tables de synchronisation cross-device
-- À exécuter dans le dashboard Supabase → SQL Editor
-- =============================================================================

-- ── 1. user_preferences ───────────────────────────────────────────────────────
-- Une seule ligne par utilisateur.
-- Contient : réglages son, voix, et UserSettings (favoris, thème, langue…)

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  sound      jsonb       NOT NULL DEFAULT '{}',
  voice      jsonb       NOT NULL DEFAULT '{}',
  settings   jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS : chaque utilisateur ne voit que ses propres préférences
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences: lecture propriétaire"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_preferences: écriture propriétaire"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_preferences: mise à jour propriétaire"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- ── 2. free_timer_sessions ────────────────────────────────────────────────────
-- Sessions du chronomètre libre / apnée statique.

CREATE TABLE IF NOT EXISTS public.free_timer_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL,
  completed_at     timestamptz,
  duration_seconds numeric     NOT NULL DEFAULT 0,
  laps             jsonb       NOT NULL DEFAULT '[]',
  notes            text        NOT NULL DEFAULT '',
  mode             text        NOT NULL DEFAULT 'apnea',
  synced_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS free_timer_sessions_user_started
  ON public.free_timer_sessions (user_id, started_at DESC);

-- RLS
ALTER TABLE public.free_timer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "free_timer_sessions: lecture propriétaire"
  ON public.free_timer_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "free_timer_sessions: écriture propriétaire"
  ON public.free_timer_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "free_timer_sessions: mise à jour propriétaire"
  ON public.free_timer_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "free_timer_sessions: suppression propriétaire"
  ON public.free_timer_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ── 3. Index updated_at sur les tables existantes (optimise les pull incrémentaux)
-- (À ignorer si les tables exercises/sessions n'existent pas encore)

CREATE INDEX IF NOT EXISTS exercises_user_updated
  ON public.exercises (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS sessions_user_completed
  ON public.sessions (user_id, completed_at DESC);
