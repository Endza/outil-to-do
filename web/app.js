// Application to-do.
// Organisée en 3 couches remplaçables :
//   - store      : persistance (Supabase — base en ligne, synchro iPhone + ordi)
//   - triage     : découpage/tri du texte (ici heuristique locale ; deviendra Gemini)
//   - ui         : rendu et interactions
//
// Le reste du code ne connaît que les interfaces store.* et triage.*.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

/* ------------------------------ STORE (Supabase) ------------------------------ */
const store = (() => {
  const REST = `${SUPABASE_URL}/rest/v1/taches`;
  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  // Champs que la base gère elle-même : on ne les envoie pas.
  const _payload = t => ({
    titre: t.titre,
    domaine: t.domaine,
    urgence: t.urgence,
    echeance: t.echeance || null,
    statut: t.statut || "a_faire",
    a_valider: t.a_valider !== false,
  });

  return {
    async toutes() {
      const r = await fetch(`${REST}?select=*&order=date_creation.desc`, { headers });
      if (!r.ok) throw new Error("Lecture Supabase échouée : " + r.status);
      return r.json();
    },
    async ajouterPlusieurs(taches) {
      if (!taches.length) return;
      const r = await fetch(REST, {
        method: "POST",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify(taches.map(_payload)),
      });
      if (!r.ok) throw new Error("Ajout Supabase échoué : " + r.status);
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

/* ------------------------------ TRIAGE (local) ------------------------------ */
// Placeholder sans IA : découpe le texte et devine domaine/urgence/échéance.
// Sera remplacé par un appel à la fonction serveur « structurer » (Gemini).
const triage = (() => {
  const MOTS_PRO = ["client", "clients", "comptable", "réunion", "reunion", "boulot",
    "boss", "collègue", "collegue", "facture", "devis", "projet", "email pro",
    "manager", "rapport", "deadline", "livrable", "bureau"];
  const MOTS_PERSO = ["maman", "papa", "famille", "cadeau", "courses", "médecin",
    "medecin", "dentiste", "sport", "vacances", "maison", "ménage", "menage",
    "anniversaire", "ami", "amie", "enfant"];
  const MOTS_URGENT = ["urgent", "vite", "aujourd'hui", "ce soir", "ce matin",
    "tout de suite", "asap", "avant ce soir", "demain matin"];

  const JOURS = { "lundi":1,"mardi":2,"mercredi":3,"jeudi":4,"vendredi":5,"samedi":6,"dimanche":0 };

  function _iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function _devinerEcheance(txt) {
    const t = txt.toLowerCase();
    const maintenant = new Date();
    if (/\baujourd'?hui\b|\bce soir\b|\bce matin\b/.test(t)) return _iso(maintenant);
    if (/\bdemain\b/.test(t)) { const d = new Date(maintenant); d.setDate(d.getDate()+1); return _iso(d); }
    if (/\bapr[eè]s-?demain\b/.test(t)) { const d = new Date(maintenant); d.setDate(d.getDate()+2); return _iso(d); }
    for (const [nom, num] of Object.entries(JOURS)) {
      if (new RegExp(`\\b(avant |ce |)${nom}\\b`).test(t)) {
        const d = new Date(maintenant);
        let delta = (num - d.getDay() + 7) % 7;
        if (delta === 0) delta = 7;
        d.setDate(d.getDate() + delta);
        return _iso(d);
      }
    }
    return null;
  }
  function _devinerDomaine(txt) {
    const t = txt.toLowerCase();
    const pro = MOTS_PRO.some(m => t.includes(m));
    const perso = MOTS_PERSO.some(m => t.includes(m));
    if (pro && !perso) return "pro";
    if (perso && !pro) return "perso";
    return "perso"; // défaut ; l'utilisateur corrige
  }
  function _devinerUrgence(txt) {
    const t = txt.toLowerCase();
    return MOTS_URGENT.some(m => t.includes(m)) ? "urgent" : "normal";
  }
  function _nettoyer(s) {
    return s.replace(/^\s*(et |puis |aussi |penser [aà] |il faut |je dois |ne pas oublier de )/i, "")
            .replace(/\s+/g, " ")
            .replace(/^[\s,;.]+|[\s,;.]+$/g, "")
            .trim();
  }

  return {
    // Retourne une liste de propositions {titre, domaine, urgence, echeance}
    async structurer(texteBrut) {
      const morceaux = texteBrut
        .split(/\n|[.;]|\bet\b(?=\s+(?:penser|acheter|appeler|rappeler|envoyer|faire|réserver|reserver|prendre))| puis /i)
        .map(_nettoyer)
        .filter(m => m.length > 2);
      const source = morceaux.length ? morceaux : [_nettoyer(texteBrut)];
      return source.map(m => ({
        titre: m.charAt(0).toUpperCase() + m.slice(1),
        domaine: _devinerDomaine(m),
        urgence: _devinerUrgence(m),
        echeance: _devinerEcheance(m),
      }));
    },
  };
})();

/* ------------------------------ UI ------------------------------ */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function uid() {
  return "t_" + Date.now().toString(36) + "_" + Math.floor(Math.random()*1e6).toString(36);
}

// --- Ajout direct : l'IA range en silence, on ajuste après ---
$("#btn-ajouter").addEventListener("click", async () => {
  const texte = $("#saisie").value.trim();
  if (!texte) return;
  const btn = $("#btn-ajouter");
  btn.disabled = true;
  try {
    const props = await triage.structurer(texte);
    const taches = props
      .filter(p => p.titre && p.titre.trim())
      .map(p => ({
        id: uid(),
        titre: p.titre.trim(),
        domaine: p.domaine === "pro" ? "pro" : "perso",
        urgence: p.urgence === "urgent" ? "urgent" : "normal",
        echeance: p.echeance || null,
        statut: "a_faire",
        a_valider: true, // rangé automatiquement, à vérifier d'un coup d'œil
        date_creation: new Date().toISOString(),
      }));
    if (taches.length) await store.ajouterPlusieurs(taches);
    $("#saisie").value = "";
    await rendreListe();
  } catch (e) {
    console.error(e);
    alert("Impossible d'enregistrer pour l'instant. Vérifie ta connexion et réessaie.");
  } finally {
    btn.disabled = false;
  }
});

// --- Liste ---
let filtreCourant = "tout";
let editionId = null; // id de la tâche en cours d'édition sur place
$$(".chip").forEach(chip => chip.addEventListener("click", () => {
  $$(".chip").forEach(c => c.classList.remove("is-active"));
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
