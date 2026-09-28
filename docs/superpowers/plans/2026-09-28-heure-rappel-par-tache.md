# Heure de rappel par tâche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de choisir une heure de rappel propre à chaque tâche, avec l'heure globale comme valeur par défaut.

**Architecture:** La sélection des tâches à notifier devient une fonction pure isolée (testable sans réseau ni web-push). Le handler serverless l'utilise après avoir lu les tâches du jour (colonne `heure_rappel` ajoutée). L'app affiche un sélecteur d'heure par tâche, visible seulement quand une échéance est renseignée.

**Tech Stack:** JavaScript (Node serverless côté Vercel, vanilla JS côté navigateur), Supabase REST, web-push. Aucun framework de test : script Node + `node:assert`.

## Global Constraints

- Pas de commentaires dans le code sauf « pourquoi » non évident.
- Pas de tiret cadratin dans le code ou les textes.
- Granularité des rappels : heure pleine (0-23), car le cron externe appelle l'endpoint une fois par heure à la minute 0.
- Chaque tâche notifiée une seule fois (`taches.notifie`).
- Repli : heure effective = `taches.heure_rappel` si non nul, sinon `parametres.heure_rappel` (défaut 8 si absent).

---

### Task 1: Fonction pure de sélection des tâches à notifier

**Files:**
- Create: `web/api/rappels-selection.js`
- Test: `web/test/rappels-selection.test.js`

**Interfaces:**
- Produces:
  - `heureEffective(tache, heureDefaut) -> number` où `tache = { heure_rappel: number|null }`
  - `tachesAEnvoyer(taches, heureDefaut, heureCourante) -> tache[]`

- [ ] **Step 1: Write the failing test**

`web/test/rappels-selection.test.js` :
```js
const assert = require("assert");
const { heureEffective, tachesAEnvoyer } = require("../api/rappels-selection");

assert.strictEqual(heureEffective({ heure_rappel: null }, 8), 8);
assert.strictEqual(heureEffective({ heure_rappel: 14 }, 8), 14);

const taches = [
  { id: "a", heure_rappel: null },
  { id: "b", heure_rappel: 14 },
  { id: "c", heure_rappel: 9 },
];
assert.deepStrictEqual(tachesAEnvoyer(taches, 9, 9).map(t => t.id), ["a", "c"]);
assert.deepStrictEqual(tachesAEnvoyer(taches, 9, 14).map(t => t.id), ["b"]);
assert.deepStrictEqual(tachesAEnvoyer(taches, 9, 10).map(t => t.id), []);

console.log("OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node web/test/rappels-selection.test.js`
Expected: FAIL (`Cannot find module '../api/rappels-selection'`)

- [ ] **Step 3: Write minimal implementation**

`web/api/rappels-selection.js` :
```js
function heureEffective(tache, heureDefaut) {
  return tache.heure_rappel != null ? tache.heure_rappel : heureDefaut;
}

function tachesAEnvoyer(taches, heureDefaut, heureCourante) {
  return taches.filter(t => heureEffective(t, heureDefaut) === heureCourante);
}

module.exports = { heureEffective, tachesAEnvoyer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node web/test/rappels-selection.test.js`
Expected: PASS (affiche `OK`, code de sortie 0)

- [ ] **Step 5: Commit**

```bash
git add web/api/rappels-selection.js web/test/rappels-selection.test.js
git commit -m "Rappels : fonction pure de sélection des tâches par heure"
```

---

### Task 2: Migration colonne heure_rappel par tâche

**Files:**
- Create: `supabase/migrations/0004_heure_rappel_par_tache.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0004_heure_rappel_par_tache.sql` :
```sql
-- Heure de rappel propre à une tâche (0-23, heure de Paris). Nul = suit l'heure globale
-- (parametres.heure_rappel). À exécuter dans Supabase : SQL Editor -> coller -> Run.

alter table taches add column if not exists heure_rappel integer;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0004_heure_rappel_par_tache.sql
git commit -m "Migration : colonne heure_rappel par tâche"
```

> Note d'exécution manuelle (hors code) : cette migration devra être exécutée dans le SQL Editor Supabase avant que la fonctionnalité marche en production. À signaler à l'utilisateur au moment du déploiement.

---

### Task 3: Handler serverless utilise l'heure par tâche

**Files:**
- Modify: `web/api/envoyer-rappels.js`

**Interfaces:**
- Consumes: `tachesAEnvoyer(taches, heureDefaut, heureCourante)` de Task 1.

État actuel du bloc à modifier (après la mise en place VAPID) :
```js
  const [reglages] = await supabase(`parametres?id=eq.app&select=heure_rappel`);
  const heureChoisie = reglages && reglages.heure_rappel != null ? reglages.heure_rappel : 8;
  if (heureParisActuelle() !== heureChoisie) {
    res.status(200).json({ envoyes: 0, raison: "pas encore l'heure choisie", heureChoisie });
    return;
  }

  const aujourdhui = dateParisAujourdhui();
  const [taches, abonnements] = await Promise.all([
    supabase(`taches?select=id,titre&statut=eq.a_faire&notifie=eq.false&echeance=eq.${aujourdhui}`),
    supabase(`abonnements_push?select=*`),
  ]);

  let envoyes = 0;
  const abonnementsExpires = new Set();

  for (const tache of taches) {
```

- [ ] **Step 1: Ajouter l'import de la fonction pure**

En haut du fichier, sous `const webpush = require("web-push");` :
```js
const { tachesAEnvoyer } = require("./rappels-selection");
```

- [ ] **Step 2: Remplacer l'arrêt anticipé global + le fetch, et filtrer par tâche**

Remplacer le bloc « état actuel » ci-dessus par :
```js
  const [reglages] = await supabase(`parametres?id=eq.app&select=heure_rappel`);
  const heureDefaut = reglages && reglages.heure_rappel != null ? reglages.heure_rappel : 8;

  const aujourdhui = dateParisAujourdhui();
  const [tachesDuJour, abonnements] = await Promise.all([
    supabase(`taches?select=id,titre,heure_rappel&statut=eq.a_faire&notifie=eq.false&echeance=eq.${aujourdhui}`),
    supabase(`abonnements_push?select=*`),
  ]);

  const taches = tachesAEnvoyer(tachesDuJour, heureDefaut, heureParisActuelle());

  let envoyes = 0;
  const abonnementsExpires = new Set();

  for (const tache of taches) {
```

(La boucle d'envoi, le PATCH `notifie=true`, la suppression des abonnements expirés et la réponse JSON finale restent inchangés : ils itèrent sur `taches`, qui contient désormais uniquement les tâches dont l'heure effective correspond à l'heure courante.)

- [ ] **Step 3: Vérifier que la sélection unitaire passe toujours**

Run: `node web/test/rappels-selection.test.js`
Expected: PASS (`OK`)

- [ ] **Step 4: Vérifier la syntaxe du handler**

Run: `node --check web/api/envoyer-rappels.js`
Expected: aucune sortie, code de sortie 0

- [ ] **Step 5: Commit**

```bash
git add web/api/envoyer-rappels.js
git commit -m "Rappels : envoie selon l'heure propre à chaque tâche (défaut global)"
```

---

### Task 4: Sélecteur d'heure par tâche dans l'app

**Files:**
- Modify: `web/app.js`

**Interfaces:**
- Consumes: `store.modifier(id, champs)` (existant), `storeParametres.heureRappel()` (existant).

- [ ] **Step 1: Mémoriser l'heure globale pour l'affichage du défaut**

Repérer le bloc de réglage de l'heure (actuellement) :
```js
  try {
    select.value = await storeParametres.heureRappel();
  } catch (e) {
```
Le remplacer par :
```js
  try {
    heureRappelGlobale = await storeParametres.heureRappel();
    select.value = heureRappelGlobale;
  } catch (e) {
```
Et, juste avant la ligne `// Affichage initial de la to-do` (près de `rendreListe();`), déclarer la variable au niveau module :
```js
let heureRappelGlobale = 8;
```
(La placer avant tout usage, en tête de la portée module, à côté des autres `let`/`const` d'état comme `editionId`.)

Dans le gestionnaire `select.addEventListener("change", ...)` de l'heure globale, mettre à jour la variable après enregistrement réussi :
```js
      await storeParametres.definirHeureRappel(parseInt(select.value, 10));
      heureRappelGlobale = parseInt(select.value, 10);
```

- [ ] **Step 2: Ajouter le sélecteur d'heure dans la carte d'édition**

Dans `editeurTache`, remplacer le bloc :
```js
      <div class="echeance-wrap">
        <input type="date" data-champ="echeance" value="${t.echeance||''}" aria-label="Échéance" />
      </div>
```
par :
```js
      <div class="echeance-wrap">
        <input type="date" data-champ="echeance" value="${t.echeance||''}" aria-label="Échéance" />
        <select data-champ="heure_rappel" class="select-heure-tache" aria-label="Heure du rappel" ${t.echeance ? '' : 'hidden'}>
          <option value="">Par défaut (${heureRappelGlobale}h)</option>
          ${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${t.heure_rappel === h ? 'selected' : ''}>${h}h</option>`).join('')}
        </select>
      </div>
```

- [ ] **Step 3: Câbler le sélecteur et la visibilité selon la date**

Remplacer la ligne :
```js
  el.querySelector('[data-champ="echeance"]').addEventListener("input", e => maj({ echeance: e.target.value || null }));
```
par :
```js
  const selHeure = el.querySelector('[data-champ="heure_rappel"]');
  selHeure.addEventListener("change", e => maj({ heure_rappel: e.target.value === "" ? null : parseInt(e.target.value, 10) }));
  el.querySelector('[data-champ="echeance"]').addEventListener("input", e => {
    const val = e.target.value || null;
    maj({ echeance: val });
    selHeure.hidden = !val;
  });
```

- [ ] **Step 4: Vérifier la syntaxe**

Run: `node --check web/app.js`
Expected: aucune sortie, code de sortie 0

- [ ] **Step 5: Commit**

```bash
git add web/app.js
git commit -m "App : sélecteur d'heure de rappel par tâche (visible si échéance)"
```

---

### Task 5: Fichier de suivi des tests

**Files:**
- Create: `tests/heure-par-tache.md`

- [ ] **Step 1: Écrire le suivi**

`tests/heure-par-tache.md` :
```markdown
# Tests — Heure de rappel par tâche

## Résumé
Total : 3 | ✅ Pass : 3 | ❌ Fail : 0 | ⏳ À faire : 0

## Cas de test

| # | Comportement attendu | Statut | Détail |
|---|----------------------|--------|--------|
| 1 | Une tâche sans heure choisie suit l'heure globale | ✅ PASS | — |
| 2 | Une tâche avec heure propre part à son heure, pas à l'heure globale | ✅ PASS | — |
| 3 | À une heure sans tâche correspondante, rien n'est envoyé | ✅ PASS | — |
```

- [ ] **Step 2: Commit**

```bash
git add tests/heure-par-tache.md
git commit -m "Tests : suivi heure de rappel par tâche"
```

---

## Self-Review

**Spec coverage :**
- Données (colonne nullable + repli) → Task 2 (migration) + Task 3 (repli via `heureDefaut`). ✓
- Logique d'envoi (suppression arrêt global, filtrage par tâche) → Task 3, logique pure Task 1. ✓
- Interface (sélecteur visible si date, option « Par défaut (Xh) », remise à nul) → Task 4. ✓
- Tests (script Node + suivi) → Task 1 + Task 5. ✓

**Placeholder scan :** aucun TBD/TODO ; tout le code est fourni. ✓

**Type consistency :** `tachesAEnvoyer(taches, heureDefaut, heureCourante)` et `heureEffective(tache, heureDefaut)` identiques entre Task 1, son test, et l'usage Task 3. `heure_rappel` (colonne, propriété JS, `data-champ`) cohérent partout. `heureRappelGlobale` déclarée avant usage en Task 4. ✓
