// Fonction serverless (Vercel) — capture d'un texte dicté/tapé.
// 1) Appelle Gemini pour découper le texte en tâches et les trier (pro/perso, urgence, échéance).
// 2) Enregistre les tâches dans Supabase.
// 3) Renvoie les tâches créées.
// Repli : si Gemini est indisponible/échoue, enregistre le texte brut en une seule tâche
// (la capture ne perd jamais rien).

const SUPABASE_URL = "https://bphiuavmlhxxcicwbzpg.supabase.co";
// Clé anon (publique par conception, protégée par les règles RLS).
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwaGl1YXZtbGh4eGNpY3dienBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjI5MzcsImV4cCI6MjEwNDQzODkzN30.BAT9Mq7AlzLkvTzJbYH0FHjqvqCIOeuk8khn_u7BP7A";

const GEMINI_MODEL = "gemini-2.0-flash";

function dateParisAujourdhui() {
  // Date du jour au format YYYY-MM-DD dans le fuseau Europe/Paris.
  const fmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date()); // fr-CA => AAAA-MM-JJ
}

function normaliser(t) {
  const domaine = t && t.domaine === "pro" ? "pro" : "perso";
  const urgence = t && t.urgence === "urgent" ? "urgent" : "normal";
  let echeance = null;
  if (t && typeof t.echeance === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.echeance)) {
    echeance = t.echeance;
  }
  const titre = (t && typeof t.titre === "string" ? t.titre : "").trim();
  return { titre, domaine, urgence, echeance, statut: "a_faire", a_valider: true };
}

async function trierAvecGemini(texte, cle) {
  const aujourdhui = dateParisAujourdhui();
  const consigne =
    "Tu transformes un texte dicté en vrac (français) en liste de tâches à faire. " +
    "Découpe-le en tâches DISTINCTES. Pour chaque tâche renvoie : " +
    "\"titre\" (reformulé court et clair, sans \"penser à\"/\"il faut\"), " +
    "\"domaine\" (\"pro\" ou \"perso\"), " +
    "\"urgence\" (\"urgent\" ou \"normal\"), " +
    "\"echeance\" (date au format AAAA-MM-JJ, ou null si aucune date évoquée). " +
    `Aujourd'hui = ${aujourdhui} (fuseau Europe/Paris) : résous les dates relatives ` +
    "comme \"demain\", \"après-demain\", \"avant vendredi\", \"lundi prochain\". " +
    "Réponds UNIQUEMENT par un tableau JSON d'objets, sans texte autour.";

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cle}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: consigne }] },
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
  if (!Array.isArray(arr)) arr = arr.taches || arr.tasks || arr.items || [];
  return arr.map(normaliser).filter(t => t.titre.length > 0);
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
  let taches;
  let triePar = "gemini";
  try {
    if (!cle) throw new Error("GEMINI_API_KEY manquante");
    taches = await trierAvecGemini(texte, cle);
    if (!taches.length) throw new Error("Aucune tâche extraite");
  } catch (e) {
    // Repli : une seule tâche brute, pour ne rien perdre.
    console.error("Tri Gemini indisponible, repli brut :", e.message);
    triePar = "brut";
    taches = [normaliser({ titre: texte, domaine: "perso", urgence: "normal", echeance: null })];
  }

  try {
    const crees = await enregistrer(taches);
    res.status(200).json({ triePar, taches: crees });
  } catch (e) {
    console.error("Enregistrement échoué :", e.message);
    res.status(502).json({ erreur: "Enregistrement impossible", detail: e.message });
  }
};
