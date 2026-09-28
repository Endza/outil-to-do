# Heure de rappel par tâche — design

## Contexte

Aujourd'hui les rappels (notifications push) partent à une **heure globale unique**
(`parametres.heure_rappel`). Toutes les tâches dont l'échéance est le jour même sont
notifiées à cette même heure. L'utilisateur veut pouvoir choisir une heure **par tâche**.

Contrainte technique : le cron externe (cron-job.org) appelle l'endpoint une fois par heure,
à la minute 0. La granularité des rappels est donc l'**heure pleine** (pas de « 9h30 »).

## Modèle retenu

Heure par tâche **avec l'heure globale comme valeur par défaut** :
- Une tâche peut avoir sa propre heure de rappel.
- Si elle n'en a pas, elle suit l'heure globale.
- Le réglage global est conservé (il sert de défaut et de repli).

## 1. Données

- Nouvelle colonne `taches.heure_rappel` (entier 0-23, **nullable**). Migration
  `supabase/migrations/0004_heure_rappel_par_tache.sql`.
- `parametres.heure_rappel` inchangé, sert de défaut.
- Repli : heure effective d'une tâche = `taches.heure_rappel` si non nul, sinon
  `parametres.heure_rappel`. Conséquence assumée : changer l'heure globale déplace toutes les
  tâches restées « par défaut » (heure_rappel nul) ; les tâches avec heure explicite ne bougent pas.

## 2. Logique d'envoi (`web/api/envoyer-rappels.js`)

Changement : suppression de l'arrêt anticipé basé sur l'heure globale unique (aujourd'hui la
fonction retourne tôt si `heureParisActuelle() !== heureChoisie`).

Nouveau déroulé, à chaque appel horaire :
1. Lire l'heure globale (défaut).
2. Récupérer les tâches `statut=a_faire`, `notifie=false`, `echeance=aujourd'hui` (Paris),
   en incluant la colonne `heure_rappel`.
3. Pour chaque tâche, calculer l'heure effective (propre sinon globale).
4. N'envoyer que les tâches dont l'heure effective = heure de Paris courante.
5. Marquer `notifie=true` uniquement pour les tâches effectivement envoyées.

Le cron externe continue d'appeler l'endpoint chaque heure, sans changement de configuration.

## 3. Interface (`web/app.js`, carte d'édition de tâche)

- À côté du champ date (`echeance`), afficher un sélecteur d'heure **uniquement quand une date
  est renseignée**.
- Le sélecteur propose en tête l'option **« Par défaut (Xh) »** (valeur nulle = suit l'heure
  globale), puis 0h à 23h.
- Valeur affichée par défaut : « Par défaut ».
- Choisir une heure précise écrit `heure_rappel` sur cette tâche ; revenir sur « Par défaut »
  remet la valeur à nul.
- Le sélecteur d'heure global de l'en-tête reste inchangé.

## Tests

Le projet n'a pas de framework de test. Un script Node isolé vérifie la logique de sélection
d'envoi : jeu de tâches avec heures mixtes (nulles → défaut global, et explicites), pour une
heure courante donnée, seules les tâches dont l'heure effective correspond sont retenues et
marquées notifiées. Suivi dans `tests/heure-par-tache.md`.

## Hors périmètre

- Granularité inférieure à l'heure (minutes).
- Rappels récurrents / répétés (chaque tâche reste notifiée une seule fois).
- Rappel avant le jour d'échéance (le rappel reste le jour même).
