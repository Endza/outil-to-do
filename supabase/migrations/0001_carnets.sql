-- Nouvelle table "carnets" (notes qu'on alimente au fil du temps).
-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → coller → Run.

create table if not exists carnets (
  id uuid primary key default gen_random_uuid(),
  titre text not null default '',
  contenu text not null default '',
  a_valider boolean not null default false,
  date_creation timestamptz not null default now(),
  date_maj timestamptz not null default now()
);

alter table carnets enable row level security;

-- Politiques permissives (clé "anon" utilisée directement depuis le navigateur,
-- comme pour la table "taches" déjà en place). Si tes politiques sur "taches"
-- sont différentes, adapte celles-ci pour rester cohérent.
create policy "carnets_select_anon" on carnets for select using (true);
create policy "carnets_insert_anon" on carnets for insert with check (true);
create policy "carnets_update_anon" on carnets for update using (true) with check (true);
create policy "carnets_delete_anon" on carnets for delete using (true);
