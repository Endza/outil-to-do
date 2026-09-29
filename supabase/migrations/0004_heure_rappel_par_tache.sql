-- Heure de rappel propre à une tâche (0-23, heure de Paris). Nul = suit l'heure globale
-- (parametres.heure_rappel). À exécuter dans Supabase : SQL Editor -> coller -> Run.

alter table taches add column if not exists heure_rappel integer;
