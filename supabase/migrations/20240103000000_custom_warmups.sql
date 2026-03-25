-- ── Custom Warmups table ──────────────────────────────────────────────────────
-- Échauffements créés par l'utilisateur (équivalent des exercices custom mais
-- pour le free timer). Chaque warmup contient une liste de steps JSON,
-- une phase GO éditable et une phase de récupération post-apnée.

create table if not exists custom_warmups (
  id                   text        primary key,
  user_id              uuid        references auth.users not null,
  name                 text        not null default '',
  steps                jsonb       not null default '[]',
  go_duration_s        integer     not null default 3,
  recovery_pattern     text        not null default 'soupir',
  recovery_duration_s  integer     not null default 60,
  recovery_instruction text        not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Index pour requêtes par utilisateur
create index if not exists custom_warmups_user_id_idx on custom_warmups (user_id);

-- Row Level Security
alter table custom_warmups enable row level security;

create policy "Users can manage their own custom warmups"
  on custom_warmups
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
