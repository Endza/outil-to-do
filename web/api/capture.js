// Fonction serverless (Vercel) — capture d'un texte dicté/tapé.
// 1) Appelle Gemini pour découper le texte en tâches et les trier (pro/perso, urgence, échéance).
// 2) Enregistre les tâches dans Supabase.
// 3) Renvoie les tâches créées.
// Repli : si Gemini est indisponible/échoue, enregistre le texte brut en une seule tâche
// (la capture ne perd jamais rien).

const SUPABASE_URL = "https://bphiuavmlhxxcicwbzpg.supabase.co";
// Clé anon (publique par conception, protégée par les règles RLS).
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwaGl1YXZtbGh4eGNpY3dienBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjI5MzcsImV4cCI6MjEwNDQzODkzN30.BAT9Mq7AlzLkvTzJbYH0FHjqvqCIOeuk8khn_u7BP7A";

const GEMINI_MODEL = "gemini-2.5-flash"; // essai diagnostic : "gemini-3.6-flash" provoquait un échec systématique

function dateParisAujourdhui() {
  // Date du jour au format YYYY-MM-DD dans le fuseau Europe/Paris.
  const fmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date()); // fr-CA => AAAA-MM-JJ
}

function normaliserTache(t) {
  const domaine = t && t.domaine === "pro" ? "pro" : "perso";
  const urgence = t && t.urgence === "urgent" ? "urgent" : "normal";
  let echeance = null;
  if (t && typeof t.echeance === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.echeance)) {
    echeance = t.echeance;
  }
  const titre = (t && typeof t.titre === "string" ? t.titre : "").trim();
  return { titre, domaine, urgence, echeance, statut: "a_faire", a_valider: true };
}

function normaliserNote(t) {
  const carnet = (t && typeof t.carnet === "string" ? t.carnet : "").trim();
  const contenu = (t && typeof t.contenu === "string" ? t.contenu : "").trim();
  return { carnet: carnet || null, contenu };
}

async function trierAvecGemini(texte, cle) {
  const aujourdhui = dateParisAujourdhui();
  const consigne =
    "Tu ranges un texte dicté en vrac (français). Découpe-le en éléments DISTINCTS. " +
    "Chaque élément est soit une TÂCHE à faire, soit une NOTE libre à garder (une idée, " +
    "une info à conserver, un suivi qu'on alimente au fil du temps). " +
    "Renvoie pour chaque élément un champ \"type\" (\"tache\" ou \"note\"). " +
    "Si type=\"tache\" : \"titre\" (reformulé court et clair, sans \"penser à\"/\"il faut\"), " +
    "\"domaine\" (\"pro\" ou \"perso\"), \"urgence\" (\"urgent\" ou \"normal\"), " +
    "\"echeance\" (date au format AAAA-MM-JJ, ou null si aucune date évoquée). " +
    "Si type=\"note\" : \"contenu\" (le texte de la note, reformulé proprement), " +
    "\"carnet\" (le nom du carnet/de la note dans lequel la ranger SI la personne l'a dit " +
    "explicitement, ex. \"mets ça dans idées cadeaux\" → \"idées cadeaux\" ; sinon null — " +
    "n'invente jamais un nom de carnet). " +
    `Aujourd'hui = ${aujourdhui} (fuseau Europe/Paris) : résous les dates relatives ` +
    "comme \"demain\", \"après-demain\", \"avant vendredi\", \"lundi prochain\". " +
    "Réponds UNIQUEMENT par un tableau JSON d'objets, sans texte autour.";

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cle}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: consigne }] },
        contents: [{ parts: [{ text: texte }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    }
  );
  if (!r.ok) throw new Error("Gemini HTTP " + r.status + " " + (await r.text()).slice(0, 300));
  const data = await r.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error("Gemini: réponse vide");
  let arr = JSON.parse(txt);
  if (!Array.isArray(arr)) arr = arr.elements || arr.items || [];

  const taches = [];
  const notes = [];
  for (const item of arr) {
    if (item && item.type === "note") {
      const n = normaliserNote(item);
      if (n.contenu) notes.push(n);
    } else {
      const t = normaliserTache(item);
      if (t.titre) taches.push(t);
    }
  }
  return { taches, notes };
}

async function enregistrer(taches) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/taches`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(taches),
  });
  if (!r.ok) throw new Error("Supabase HTTP " + r.status + " " + (await r.text()).slice(0, 300));
  return r.json();
}

// --- Carnets (notes qu'on alimente au fil du temps) ---
function normaliserCle(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function listerCarnets() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/carnets?select=id,titre,contenu`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) throw new Error("Supabase HTTP " + r.status + " " + (await r.text()).slice(0, 300));
  return r.json();
}

async function creerCarnet(champs) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/carnets`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(champs),
  });
  if (!r.ok) throw new Error("Supabase HTTP " + r.status + " " + (await r.text()).slice(0, 300));
  const [cree] = await r.json();
  return cree;
}

async function alimenterCarnet(id, contenuActuel, ajout) {
  const contenu = contenuActuel ? `${contenuActuel}\n\n${ajout}` : ajout;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/carnets?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ contenu, date_maj: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error("Supabase HTTP " + r.status + " " + (await r.text()).slice(0, 300));
  const [maj] = await r.json();
  return maj;
}

// Range chaque note dans son carnet : reprend un carnet existant si la personne
// a nommé un carnet qui correspond, en crée un nouveau sinon. Une note dictée sans
// nom de carnet donne un nouveau carnet marqué "à valider" (à nommer/ranger ensuite).
async function rangerNotes(notes) {
  if (!notes.length) return [];
  const existants = await listerCarnets();
  const resultats = [];
  for (const n of notes) {
    const cleVoulue = n.carnet ? normaliserCle(n.carnet) : null;
    let cible = cleVoulue ? existants.find(c => normaliserCle(c.titre) === cleVoulue) : null;
    if (cible) {
      const maj = await alimenterCarnet(cible.id, cible.contenu, n.contenu);
      cible.contenu = maj.contenu;
      resultats.push(maj);
    } else {
      const cree = await creerCarnet({
        titre: n.carnet || "",
        contenu: n.contenu,
        a_valider: !n.carnet,
      });
      existants.push(cree);
      resultats.push(cree);
    }
  }
  return resultats;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ erreur: "Méthode non autorisée" });
    return;
  }
  let texte = "";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    texte = (body.texte || body.text || "").toString().trim();
  } catch { /* body illisible */ }

  if (!texte) {
    res.status(400).json({ erreur: "Aucun texte fourni." });
    return;
  }

  const cle = process.env.GEMINI_API_KEY;
  let taches, notes;
  let triePar = "gemini";
  let erreurGemini = null;
  try {
    if (!cle) throw new Error("GEMINI_API_KEY manquante");
    ({ taches, notes } = await trierAvecGemini(texte, cle));
    if (!taches.length && !notes.length) throw new Error("Rien d'extrait");
  } catch (e) {
    // Repli : une seule tâche brute, pour ne rien perdre.
    console.error("Tri Gemini indisponible, repli brut :", e.message);
    triePar = "brut";
    erreurGemini = e.message; // diagnostic temporaire, à retirer une fois le tri IA stabilisé
    taches = [normaliserTache({ titre: texte, domaine: "perso", urgence: "normal", echeance: null })];
    notes = [];
  }

  try {
    const [tachesCrees, carnetsTouches] = await Promise.all([
      taches.length ? enregistrer(taches) : Promise.resolve([]),
      rangerNotes(notes),
    ]);
    res.status(200).json({ triePar, taches: tachesCrees, carnets: carnetsTouches, erreurGemini });
  } catch (e) {
    console.error("Enregistrement échoué :", e.message);
    res.status(502).json({ erreur: "Enregistrement impossible", detail: e.message });
  }
};
