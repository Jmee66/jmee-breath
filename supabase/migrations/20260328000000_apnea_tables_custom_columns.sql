-- ── Colonnes manquantes pour le mode Custom ──────────────────────────────────
-- Ajout des champs custom_program, custom_phases, custom_series_count,
-- recovery_note absents de la migration initiale.

alter table apnea_tables
  add column if not exists custom_program      jsonb    default null,
  add column if not exists custom_phases       jsonb    default null,
  add column if not exists custom_series_count integer  default null,
  add column if not exists recovery_note       text     default null;
