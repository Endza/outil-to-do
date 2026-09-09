# Raccourci Mac — « Nouvelle tâche » à la voix, depuis n'importe où

Objectif : appuyer sur un raccourci clavier depuis n'importe quelle app, dicter une tâche ou une
note, et que ça atterrisse dans la to-do en ligne (synchronisée iPhone + ordi), triée par l'IA
(tâche vs note, pro/perso, urgence, échéance, carnet).

## Prérequis
- **Dictée activée** : Réglages Système → Clavier → Dictée → activer.

## Créer le raccourci (app Raccourcis / Shortcuts)

1. Ouvrir l'app **Raccourcis**, cliquer **+** (nouveau raccourci), le nommer **Nouvelle tâche**.
2. Ajouter l'action **Dicter le texte** (chercher « Dicter »). Régler la langue sur **Français** si besoin.
3. Ajouter l'action **Obtenir le contenu de l'URL** (« Get Contents of URL »). La placer après la dictée.
   Configurer :
   - **URL** : `https://outil-to-do.vercel.app/api/capture`
   - Déplier **Afficher plus** :
     - **Méthode** : `POST`
     - **En-têtes** : **une seule** ligne → `Content-Type` = `application/json`
     - **Corps de la requête** (Request Body) : **JSON**, un seul champ :
       - `texte` (type Texte) → insérer la **variable magique** « Texte dicté » (jeton bleu),
         PAS le texte littéral « Texte dicté ».

   Autorisations : au 1er lancement, macOS/iOS demande d'autoriser la dictée et l'accès réseau
   du raccourci — accepter, sinon rien ne part.
4. **Raccourci clavier global** : sélectionner le raccourci → panneau de détails (icône ⓘ à droite)
   → **Ajouter un raccourci clavier** → choisir une combinaison, ex. `⌃⌥⌘T`.

## Diagnostic temporaire : voir l'erreur si le tri échoue

Le tri IA échoue parfois quand le raccourci est déclenché depuis une autre app (cause pas
encore identifiée). Pour voir l'erreur exacte sans avoir à rouvrir l'app Raccourcis, ajoute
ces actions après « Obtenir le contenu de l'URL » :

5. Ajouter **Obtenir la valeur d'un dictionnaire** (« Get Dictionary Value »). Configurer :
   - **Obtenir** : `Valeur` pour la **clé** `triePar`
   - **Dictionnaire** : la **variable magique** du résultat de l'action « Obtenir le contenu
     de l'URL » (jeton bleu, pas de texte littéral)
6. Ajouter **Si** (« If »). Condition : la valeur récupérée à l'étape 5 **est égale à** `brut`.
7. À l'intérieur du **Si** :
   - Ajouter une nouvelle **Obtenir la valeur d'un dictionnaire**, même dictionnaire, clé
     `erreurGemini` cette fois.
   - Ajouter **Afficher une notification** (« Show Notification »), avec cette valeur comme texte.
8. Fermer le **Si** (« Fin si » se rajoute automatiquement).

Une fois qu'on aura vu l'erreur exacte et corrigé la vraie cause, ces étapes 5 à 8 pourront être
retirées du raccourci.

## Utilisation
Appuie sur ta combinaison depuis n'importe quelle app → une fenêtre de dictée s'ouvre →
parle → le texte passe par le même tri IA que dans l'app (tâche ou note, pro/perso, urgence,
échéance, carnet si tu l'as nommé) → ça apparaît dans l'app (onglet « À faire » ou « Notes »,
badge « sync »).

## Équivalent iPhone
Même logique dans l'app Raccourcis iOS, déclenchée par Siri (« Hey Siri, nouvelle tâche »),
le bouton Action, ou un tap au dos du téléphone.
