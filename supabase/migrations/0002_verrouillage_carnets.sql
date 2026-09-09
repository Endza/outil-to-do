-- Verrouillage des carnets par mot de passe (verrou d'écran, pas un chiffrement :
-- le contenu reste lisible par qui a accès direct à la base).
-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → coller → Run.

alter table carnets add column if not exists verrouille boolean not null default false;

create table if not exists parametres (
  id text primary key default 'app',
  mot_de_passe_hash text,
  date_maj timestamptz not null default now()
);

alter table parametres enable row level security;

create policy "parametres_select_anon" on parametres for select using (true);
create policy "parametres_insert_anon" on parametres for insert with check (true);
create policy "parametres_update_anon" on parametres for update using (true) with check (true);
