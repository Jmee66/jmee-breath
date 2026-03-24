-- =============================================================================
-- Migration : tables exercises et sessions
-- À exécuter dans le dashboard Supabase → SQL Editor
-- =============================================================================

-- ── 1. exercises ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exercises (
  id                        text        PRIMARY KEY,
  user_id                   uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name                      text        NOT NULL DEFAULT '',
  description               text        NOT NULL DEFAULT '',
  category                  text        NOT NULL DEFAULT 'custom',
  difficulty                int         NOT NULL DEFAULT 1,
  tags                      jsonb       NOT NULL DEFAULT '[]',
  phases                    jsonb       NOT NULL DEFAULT '[]',
  repetitions               int         NOT NULL DEFAULT 1,
  rest_between_reps_seconds int         NOT NULL DEFAULT 0,
  is_preset                 boolean     NOT NULL DEFAULT false,
  custom_presets            jsonb       NOT NULL DEFAULT '[]',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercises: lecture propriétaire"
  ON public.exercises FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "exercises: écriture propriétaire"
  ON public.exercises FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "exercises: mise à jour propriétaire"
  ON public.exercises FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "exercises: suppression propriétaire"
  ON public.exercises FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS exercises_user_updated
  ON public.exercises (user_id, updated_at DESC);

-- ── 2. sessions ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sessions (
  id                text        PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  exercise_id       text,
  exercise_snapshot jsonb,
  started_at        timestamptz NOT NULL,
  completed_at      timestamptz NOT NULL,
  duration_seconds  numeric     NOT NULL DEFAULT 0,
  reps_completed    int         NOT NULL DEFAULT 0,
  total_reps        int         NOT NULL DEFAULT 0,
  phases_log        jsonb       NOT NULL DEFAULT '[]',
  notes             text        NOT NULL DEFAULT '',
  abandoned         boolean     NOT NULL DEFAULT false,
  synced_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions: lecture propriétaire"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sessions: écriture propriétaire"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions: mise à jour propriétaire"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "sessions: suppression propriétaire"
  ON public.sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS sessions_user_completed
  ON public.sessions (user_id, completed_at DESC);
