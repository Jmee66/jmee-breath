-- Migration : ajout du champ category sur apnea_tables
-- À appliquer manuellement dans le dashboard Supabase → SQL Editor

alter table apnea_tables
  add column if not exists category text default null;
