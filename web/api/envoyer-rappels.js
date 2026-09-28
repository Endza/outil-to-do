// Fonction serverless — envoie un rappel (notification push) à l'heure choisie dans l'app, pour
// chaque tâche à faire dont l'échéance est aujourd'hui, à chaque appareil abonné. Chaque tâche
// n'est notifiée qu'une seule fois (colonne "notifie").
// Déclenchée par un service cron externe (ex. cron-job.org) qui appelle cet endpoint chaque heure
// avec le secret : /api/envoyer-rappels?cle=CRON_SECRET (le plan Vercel gratuit interdit un cron horaire).

const webpush = require("web-push");

const SUPABASE_URL = "https://bphiuavmlhxxcicwbzpg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwaGl1YXZtbGh4eGNpY3dienBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjI5MzcsImV4cCI6MjEwNDQzODkzN30.BAT9Mq7AlzLkvTzJbYH0FHjqvqCIOeuk8khn_u7BP7A";

function dateParisAujourdhui() {
  const fmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date());
}

function heureParisActuelle() {
  const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false });
  return parseInt(fmt.format(new Date()), 10);
}

async function supabase(chemin, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase HTTP ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const fourni = (req.query && req.query.cle) ||
    (req.headers.authorization === `Bearer ${secret}` ? secret : undefined);
  if (!secret || fourni !== secret) {
    res.status(401).json({ erreur: "Non autorisé." });
    return;
  }

  const clePub = process.env.VAPID_PUBLIC_KEY;
  const clePrivee = process.env.VAPID_PRIVATE_KEY;
  if (!clePub || !clePrivee) {
    res.status(500).json({ erreur: "Clés VAPID manquantes (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)." });
    return;
  }
  webpush.setVapidDetails("mailto:contact@example.com", clePub, clePrivee);

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
    for (const abonnement of abonnements) {
      const sub = {
        endpoint: abonnement.endpoint,
        keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
      };
      try {
        await webpush.sendNotification(sub, JSON.stringify({
          titre: "Rappel",
          corps: tache.titre,
        }));
        envoyes++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) abonnementsExpires.add(abonnement.id);
        else console.error("Envoi push échoué :", e.message);
      }
    }
    await supabase(`taches?id=eq.${encodeURIComponent(tache.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ notifie: true }),
    });
  }

  for (const id of abonnementsExpires) {
    await supabase(`abonnements_push?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  res.status(200).json({
    taches: taches.length,
    abonnements: abonnements.length,
    envoyes,
    abonnementsExpiresSupprimes: abonnementsExpires.size,
  });
};
