-- ── Table apnea_tables ───────────────────────────────────────────────────────

create table if not exists apnea_tables (
  id                text        primary key,
  user_id           uuid        references auth.users not null,
  name              text        not null default '',
  type              text        not null default 'co2',   -- co2 | o2 | mix
  rows              jsonb       not null default '[]',    -- TableRow[]
  reference_max_s   integer     not null default 90,
  series_count      integer     not null default 8,
  recovery_pattern  text        not null default 'soupir',
  forme_factor      real        not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists apnea_tables_user_id_idx on apnea_tables (user_id);

alter table apnea_tables enable row level security;

create policy "Users can manage their own apnea tables"
  on apnea_tables
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
