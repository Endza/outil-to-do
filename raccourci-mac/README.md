# Raccourci Mac — « Nouvelle tâche » à la voix, depuis n'importe où

Objectif : appuyer sur un raccourci clavier depuis n'importe quelle app, dicter une tâche,
et qu'elle atterrisse dans la to-do en ligne (synchronisée iPhone + ordi).

## Prérequis
- **Dictée activée** : Réglages Système → Clavier → Dictée → activer.

## Créer le raccourci (app Raccourcis / Shortcuts)

1. Ouvrir l'app **Raccourcis**, cliquer **+** (nouveau raccourci), le nommer **Nouvelle tâche**.
2. Ajouter l'action **Dicter le texte** (chercher « Dicter »). Régler la langue sur **Français** si besoin.
3. Ajouter l'action **Obtenir le contenu de l'URL** (« Get Contents of URL »). La placer après la dictée.
   Configurer (config qui fonctionne, validée) :
   - **URL** : l'adresse Supabase **avec la clé anon en paramètre** (tout sur une seule ligne, sans retour à la ligne) :
     `https://bphiuavmlhxxcicwbzpg.supabase.co/rest/v1/taches?apikey=<CLE_ANON>`
   - Déplier **Afficher plus** :
     - **Méthode** : `POST`
     - **En-têtes** : **une seule** ligne → `Content-Type` = `application/json`
       (Important : ne PAS mettre la clé anon dans un en-tête. Coller la longue clé dans un
       champ d'en-tête introduit facilement un retour à la ligne caché qui casse la requête
       — Supabase répond alors « connexion réseau perdue ». La clé va dans l'URL.)
     - **Corps de la requête** (Request Body) : **JSON**, un seul champ :
       - `titre` (type Texte) → insérer la **variable magique** « Texte dicté » (jeton bleu),
         PAS le texte littéral « Texte dicté ».
       (`domaine` et `a_valider` sont remplis automatiquement par la base : `perso` et `vrai`.)

   Autorisations : au 1er lancement, macOS/iOS demande d'autoriser la dictée et l'accès réseau
   du raccourci — accepter, sinon rien ne part.
4. **Raccourci clavier global** : sélectionner le raccourci → panneau de détails (icône ⓘ à droite)
   → **Ajouter un raccourci clavier** → choisir une combinaison, ex. `⌃⌥⌘T`.

## Clé anon à coller
Voir `web/config.js` (variable `SUPABASE_ANON_KEY`). C'est la clé publique « anon ».

## Utilisation
Appuie sur ta combinaison depuis n'importe quelle app → une fenêtre de dictée s'ouvre →
parle → la tâche est enregistrée en ligne et apparaîtra dans l'app (onglet, badge « sync »).

## Limite de cette version (à améliorer plus tard)
La note dictée est enregistrée **telle quelle** dans « perso », marquée « à vérifier ».
Le découpage en plusieurs tâches + le tri auto (pro/perso, urgence, échéance) par l'IA
seront ajoutés en branchant le raccourci sur une fonction serveur « capture-rapide » (Gemini).
En attendant, tu ranges la note en tapant dessus dans l'app.

## Équivalent iPhone (plus tard)
Même logique dans l'app Raccourcis iOS, déclenchée par Siri (« Hey Siri, nouvelle tâche »),
le bouton Action, ou un tap au dos du téléphone.
