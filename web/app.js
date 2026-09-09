// Application to-do.
// Deux couches :
//   - store : lecture/écriture des tâches dans Supabase (base en ligne, synchro iPhone + ordi)
//   - ui    : rendu et interactions
// L'ajout passe par la fonction serveur /api/capture (Gemini découpe et trie).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/* ------------------------------ STORE (Supabase) ------------------------------ */
const store = (() => {
  const REST = `${SUPABASE_URL}/rest/v1/taches`;
  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  return {
    async toutes() {
      const r = await fetch(`${REST}?select=*&order=date_creation.desc`, { headers });
      if (!r.ok) throw new Error("Lecture Supabase échouée : " + r.status);
      return r.json();
    },
    async modifier(id, champs) {
      const r = await fetch(`${REST}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify(champs),
      });
      if (!r.ok) throw new Error("Modification Supabase échouée : " + r.status);
    },
    async supprimer(id) {
      const r = await fetch(`${REST}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      if (!r.ok) throw new Error("Suppression Supabase échouée : " + r.status);
    },
  };
})();

/* ------------------------------ STORE Carnets (Supabase) ------------------------------ */
const storeCarnets = (() => {
  const REST = `${SUPABASE_URL}/rest/v1/carnets`;
  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  return {
    async tous() {
      const r = await fetch(`${REST}?select=*&order=date_maj.desc`, { headers });
      if (!r.ok) throw new Error("Lecture Supabase échouée : " + r.status);
      return r.json();
    },
    async creer(champs) {
      const r = await fetch(REST, {
        method: "POST",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify({ titre: "", contenu: "", a_valider: false, ...champs }),
      });
      if (!r.ok) throw new Error("Création Supabase échouée : " + r.status);
      const [cree] = await r.json();
      return cree;
    },
    async modifier(id, champs) {
      const r = await fetch(`${REST}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ ...champs, date_maj: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error("Modification Supabase échouée : " + r.status);
    },
    async supprimer(id) {
      const r = await fetch(`${REST}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      if (!r.ok) throw new Error("Suppression Supabase échouée : " + r.status);
    },
  };
})();

/* ------------------------------ STORE Paramètres (Supabase) ------------------------------ */
const storeParametres = (() => {
  const REST = `${SUPABASE_URL}/rest/v1/parametres`;
  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  return {
    async hashMdp() {
      const r = await fetch(`${REST}?id=eq.app&select=mot_de_passe_hash`, { headers });
      if (!r.ok) throw new Error("Lecture Supabase échouée : " + r.status);
      const [ligne] = await r.json();
      return ligne ? ligne.mot_de_passe_hash : null;
    },
    async definirHashMdp(hash) {
      const r = await fetch(`${REST}?on_conflict=id`, {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({ id: "app", mot_de_passe_hash: hash, date_maj: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error("Écriture Supabase échouée : " + r.status);
    },
  };
})();

async function hasher(texte) {
  const donnees = new TextEncoder().encode(texte);
  const empreinte = await crypto.subtle.digest("SHA-256", donnees);
  return Array.from(new Uint8Array(empreinte)).map(o => o.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------ UI ------------------------------ */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// --- Ajout direct : l'IA (Gemini, côté serveur) range en silence, on ajuste après ---
$("#btn-ajouter").addEventListener("click", async () => {
  const texte = $("#saisie").value.trim();
  if (!texte) return;
  const btn = $("#btn-ajouter");
  const libelle = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Tri en cours…";
  try {
    const r = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texte }),
    });
    if (!r.ok) throw new Error("capture HTTP " + r.status);
    const resultat = await r.json();
    $("#saisie").value = "";
    await Promise.all([rendreListe(), rendreCarnets()]);
    // Diagnostic temporaire : affiche l'erreur si le tri IA a échoué (repli brut).
    if (resultat.triePar === "brut") {
      alert("Tri IA indisponible (repli brut) :\n" + (resultat.erreurGemini || "raison inconnue"));
    }
  } catch (e) {
    console.error(e);
    alert("Impossible d'enregistrer pour l'instant. Vérifie ta connexion et réessaie.");
  } finally {
    btn.disabled = false;
    btn.textContent = libelle;
  }
});

// --- Liste ---
let filtreCourant = "tout";
let editionId = null; // id de la tâche en cours d'édition sur place
$$("#vue-taches .chip").forEach(chip => chip.addEventListener("click", () => {
  $$("#vue-taches .chip").forEach(c => c.classList.remove("is-active"));
  chip.classList.add("is-active");
  filtreCourant = chip.dataset.filtre;
  rendreListe();
}));

async function rendreListe() {
  let toutes;
  try {
    toutes = await store.toutes();
  } catch (e) {
    console.error(e);
    $("#groupes").innerHTML = "";
    const vide = $("#liste-vide");
    vide.hidden = false;
    vide.textContent = "Connexion à la base impossible. Vérifie ta connexion internet et recharge.";
    return;
  }
  $("#liste-vide").textContent = "Rien pour l'instant. Note une première tâche au-dessus.";
  const filtrees = toutes.filter(t => {
    if (filtreCourant === "urgent") return t.urgence === "urgent";
    if (filtreCourant === "a_valider") return t.a_valider;
    return true;
  });
  // à faire d'abord, puis terminées ; urgentes en tête de chaque groupe
  const ordonner = arr => arr.slice().sort((a, b) => {
    if ((a.statut === "fait") !== (b.statut === "fait")) return a.statut === "fait" ? 1 : -1;
    if ((a.urgence === "urgent") !== (b.urgence === "urgent")) return a.urgence === "urgent" ? -1 : 1;
    return 0;
  });

  const groupes = $("#groupes");
  groupes.innerHTML = "";
  [
    { dom: "pro", titre: "Pro" },
    { dom: "perso", titre: "Perso" },
  ].forEach(({ dom, titre }) => {
    const taches = ordonner(filtrees.filter(t => t.domaine === dom));
    if (!taches.length) return;
    const section = document.createElement("div");
    section.className = "groupe";
    section.innerHTML = `<p class="groupe-titre"><span class="dot dot-${dom}"></span>${titre}</p>`;
    taches.forEach(t => section.appendChild(t.id === editionId ? editeurTache(t) : ligneTache(t)));
    groupes.appendChild(section);
  });
  $("#liste-vide").hidden = filtrees.length > 0;
}

function ligneTache(t) {
  const el = document.createElement("div");
  el.className = `tache ${t.statut==='fait'?'done':''}`;
  el.innerHTML = `
    <input type="checkbox" class="tache-check" ${t.statut==='fait'?'checked':''} aria-label="Terminer la tâche" />
    <button type="button" class="tache-corps" aria-label="Modifier la tâche">
      <div class="tache-titre">${escapeHtml(t.titre)}</div>
      <div class="tache-meta">
        ${t.urgence==='urgent' ? '<span class="pill pill-urgent">Urgent</span>' : ''}
        ${t.echeance ? `<span class="pill pill-echeance">${formatDate(t.echeance)}</span>` : ''}
        ${t.a_valider ? '<span class="pill pill-valider">À vérifier</span>' : ''}
      </div>
    </button>`;
  el.querySelector(".tache-check").addEventListener("change", async e => {
    await store.modifier(t.id, { statut: e.target.checked ? "fait" : "a_faire" });
    rendreListe();
  });
  el.querySelector(".tache-corps").addEventListener("click", () => {
    editionId = t.id;
    rendreListe();
  });
  return el;
}

function editeurTache(t) {
  const el = document.createElement("div");
  el.className = "carte carte-edit";
  el.innerHTML = `
    <input type="text" value="${escapeAttr(t.titre)}" data-champ="titre" aria-label="Titre" />
    <div class="carte-ligne">
      <div class="segment seg-domaine" role="group" aria-label="Domaine">
        <button type="button" data-val="pro" class="${t.domaine==='pro'?'is-active':''}">Pro</button>
        <button type="button" data-val="perso" class="${t.domaine==='perso'?'is-active':''}">Perso</button>
      </div>
      <div class="segment seg-urgence" role="group" aria-label="Urgence">
        <button type="button" data-val="urgent" class="${t.urgence==='urgent'?'is-active':''}">Urgent</button>
        <button type="button" data-val="normal" class="${t.urgence==='normal'?'is-active':''}">Pas urgent</button>
      </div>
      <div class="echeance-wrap">
        <input type="date" data-champ="echeance" value="${t.echeance||''}" aria-label="Échéance" />
      </div>
    </div>
    <div class="row-actions">
      <button type="button" class="btn btn-danger" data-action="supprimer">Supprimer</button>
      <button type="button" class="btn btn-primary" data-action="ok">OK</button>
    </div>`;

  // Toute modification vaut validation : on retire le marqueur "à vérifier".
  const maj = champs => store.modifier(t.id, { ...champs, a_valider: false });

  el.querySelector('[data-champ="titre"]').addEventListener("input", e => maj({ titre: e.target.value.trim() || t.titre }));
  el.querySelector('[data-champ="echeance"]').addEventListener("input", e => maj({ echeance: e.target.value || null }));
  el.querySelectorAll(".seg-domaine button").forEach(b => b.addEventListener("click", () => {
    maj({ domaine: b.dataset.val });
    el.querySelectorAll(".seg-domaine button").forEach(x => x.classList.toggle("is-active", x === b));
  }));
  el.querySelectorAll(".seg-urgence button").forEach(b => b.addEventListener("click", () => {
    maj({ urgence: b.dataset.val });
    el.querySelectorAll(".seg-urgence button").forEach(x => x.classList.toggle("is-active", x === b));
  }));
  el.querySelector('[data-action="ok"]').addEventListener("click", () => { editionId = null; rendreListe(); });
  el.querySelector('[data-action="supprimer"]').addEventListener("click", async () => {
    await store.supprimer(t.id);
    editionId = null;
    rendreListe();
  });

  // focus sur le titre à l'ouverture
  setTimeout(() => el.querySelector('[data-champ="titre"]').focus(), 0);
  return el;
}

/* ------------------------------ Onglets (À faire / Notes) ------------------------------ */
$$(".onglet").forEach(o => o.addEventListener("click", () => {
  $$(".onglet").forEach(x => x.classList.remove("is-active"));
  o.classList.add("is-active");
  $("#vue-taches").hidden = o.dataset.vue !== "taches";
  $("#vue-notes").hidden = o.dataset.vue !== "notes";
  if (o.dataset.vue === "notes") rendreCarnets();
}));

/* ------------------------------ Carnets ------------------------------ */
let editionCarnetId = null;
const carnetsDeverrouilles = new Set(); // déverrouillés pour la session en cours (jusqu'à fermeture de l'app)
let hashMdpCache; // undefined = pas encore lu, null = aucun mot de passe défini

async function obtenirHashMdp() {
  if (hashMdpCache === undefined) hashMdpCache = await storeParametres.hashMdp();
  return hashMdpCache;
}

// Demande un nouveau mot de passe (deux fois, pour confirmation) et l'enregistre.
// Retourne true si un mot de passe a bien été défini.
async function definirNouveauMdp() {
  const mdp = prompt("Choisis un mot de passe pour verrouiller tes carnets :");
  if (!mdp) return false;
  const confirmation = prompt("Confirme le mot de passe :");
  if (confirmation !== mdp) { alert("Les deux mots de passe ne correspondent pas."); return false; }
  const hash = await hasher(mdp);
  await storeParametres.definirHashMdp(hash);
  hashMdpCache = hash;
  return true;
}

$("#btn-mdp-carnets").addEventListener("click", async () => {
  await definirNouveauMdp();
});

$("#btn-nouveau-carnet").addEventListener("click", async () => {
  const cree = await storeCarnets.creer({ titre: "", contenu: "" });
  editionCarnetId = cree.id;
  rendreCarnets();
});

async function rendreCarnets() {
  let carnets;
  try {
    carnets = await storeCarnets.tous();
  } catch (e) {
    console.error(e);
    $("#carnets").innerHTML = "";
    const vide = $("#carnets-vide");
    vide.hidden = false;
    vide.textContent = "Connexion à la base impossible. Vérifie ta connexion internet et recharge.";
    return;
  }
  $("#carnets-vide").textContent = "Aucun carnet pour l'instant. Dicte « note ça dans… » ou crée-en un.";
  const conteneur = $("#carnets");
  conteneur.innerHTML = "";
  carnets.forEach(c => conteneur.appendChild(c.id === editionCarnetId ? editeurCarnet(c) : ligneCarnet(c)));
  $("#carnets-vide").hidden = carnets.length > 0;
}

function ligneCarnet(c) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "tache carnet-ligne";

  const verrouille = c.verrouille && !carnetsDeverrouilles.has(c.id);
  if (verrouille) {
    el.innerHTML = `
      <div class="tache-corps">
        <div class="tache-titre">🔒 Carnet verrouillé</div>
      </div>`;
    el.addEventListener("click", () => deverrouillerCarnet(c));
    return el;
  }

  const apercu = (c.contenu || "").slice(0, 90);
  el.innerHTML = `
    <div class="tache-corps">
      <div class="tache-titre">${c.verrouille ? "🔒 " : ""}${escapeHtml(c.titre || "Note sans titre")}</div>
      <div class="tache-meta">
        ${c.a_valider ? '<span class="pill pill-valider">À vérifier</span>' : ''}
      </div>
      ${apercu ? `<div class="carnet-apercu">${escapeHtml(apercu)}${(c.contenu||"").length > 90 ? "…" : ""}</div>` : ''}
    </div>`;
  el.addEventListener("click", () => { editionCarnetId = c.id; rendreCarnets(); });
  return el;
}

async function deverrouillerCarnet(c) {
  const mdp = prompt("Mot de passe pour déverrouiller ce carnet :");
  if (!mdp) return;
  const hash = await obtenirHashMdp();
  if (!hash || (await hasher(mdp)) !== hash) { alert("Mot de passe incorrect."); return; }
  carnetsDeverrouilles.add(c.id);
  editionCarnetId = c.id;
  rendreCarnets();
}

function editeurCarnet(c) {
  const el = document.createElement("div");
  el.className = "carte carte-edit";
  el.innerHTML = `
    <input type="text" value="${escapeAttr(c.titre)}" placeholder="Nom du carnet" data-champ="titre" aria-label="Nom du carnet" />
    <textarea rows="6" data-champ="contenu" aria-label="Contenu">${escapeHtml(c.contenu || "")}</textarea>
    <div class="row-actions">
      <button type="button" class="btn btn-ghost" data-action="verrou">${c.verrouille ? "🔒 Verrouillé" : "🔓 Non verrouillé"}</button>
      <button type="button" class="btn btn-danger" data-action="supprimer">Supprimer</button>
      <button type="button" class="btn btn-primary" data-action="ok">OK</button>
    </div>`;

  const maj = champs => storeCarnets.modifier(c.id, { ...champs, a_valider: false });

  el.querySelector('[data-champ="titre"]').addEventListener("input", e => maj({ titre: e.target.value }));
  el.querySelector('[data-champ="contenu"]').addEventListener("input", e => maj({ contenu: e.target.value }));
  el.querySelector('[data-action="verrou"]').addEventListener("click", async () => {
    if (!c.verrouille) {
      const hash = await obtenirHashMdp();
      if (!hash && !(await definirNouveauMdp())) return; // pas de mot de passe défini, abandon
      c.verrouille = true;
      carnetsDeverrouilles.add(c.id); // reste ouvert pour la session en cours
    } else {
      c.verrouille = false;
    }
    await storeCarnets.modifier(c.id, { verrouille: c.verrouille });
    editionCarnetId = c.id;
    rendreCarnets();
  });
  el.querySelector('[data-action="ok"]').addEventListener("click", () => { editionCarnetId = null; rendreCarnets(); });
  el.querySelector('[data-action="supprimer"]').addEventListener("click", async () => {
    await storeCarnets.supprimer(c.id);
    editionCarnetId = null;
    rendreCarnets();
  });

  setTimeout(() => el.querySelector('[data-champ="titre"]').focus(), 0);
  return el;
}

/* ------------------------------ utilitaires ------------------------------ */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/* ------------------------------ DICTÉE (voix → texte) ------------------------------ */
// Utilise la reconnaissance vocale du navigateur (gratuite). Absente/instable sur
// iPhone : dans ce cas le bouton reste masqué et l'utilisateur emploie le micro du clavier.
(() => {
  const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $("#btn-dicter");
  if (!Reco || !btn) return; // non supporté → bouton masqué (hidden dans le HTML)
  btn.hidden = false;

  const saisie = $("#saisie");
  let reco = null;
  let enCours = false;
  let texteBase = "";

  function demarrer() {
    reco = new Reco();
    reco.lang = "fr-FR";
    reco.interimResults = true;
    reco.continuous = true;
    texteBase = saisie.value.trim();

    reco.onresult = e => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      saisie.value = (texteBase ? texteBase + " " : "") + transcript.trim();
    };
    reco.onerror = () => arreter();
    reco.onend = () => { if (enCours) arreter(); };

    try { reco.start(); enCours = true; majBouton(); }
    catch { arreter(); }
  }

  function arreter() {
    enCours = false;
    majBouton();
    if (reco) { try { reco.stop(); } catch {} reco = null; }
  }

  function majBouton() {
    btn.classList.toggle("is-recording", enCours);
    btn.setAttribute("aria-pressed", String(enCours));
    btn.setAttribute("title", enCours ? "Arrêter la dictée" : "Dicter à voix haute");
  }

  btn.addEventListener("click", () => (enCours ? arreter() : demarrer()));
})();

// Affichage initial de la to-do
rendreListe();

// Enregistrer le service worker (installation écran d'accueil + base pour notifs futures)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
