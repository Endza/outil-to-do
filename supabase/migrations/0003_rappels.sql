-- Rappels (notifications push) : abonnements des appareils + marqueur "déjà notifié".
-- À exécuter une fois dans Supabase : Dashboard → SQL Editor → coller → Run.

alter table taches add column if not exists notifie boolean not null default false;

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
