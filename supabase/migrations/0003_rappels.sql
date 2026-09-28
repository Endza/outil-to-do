-- Rappels (notifications push) : abonnements des appareils + marqueur "déjà notifié".
-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → coller → Run.

alter table taches add column if not exists notifie boolean not null default false;

-- Heure (0-23, heure de Paris) à laquelle envoyer les rappels du jour. Réglable dans l'app.
alter table parametres add column if not exists heure_rappel integer not null default 8;

create table if not exists abonnements_push (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  date_creation timestamptz not null default now()
);

alter table abonnements_push enable row level security;

create policy "abonnements_push_select_anon" on abonnements_push for select using (true);
create policy "abonnements_push_insert_anon" on abonnements_push for insert with check (true);
create policy "abonnements_push_delete_anon" on abonnements_push for delete using (true);
