// Service worker — étape 1 : coquille hors-ligne.
// Les gestionnaires push/notificationclick sont préparés pour la phase notifications (étape 8).

const CACHE = "todo-shell-v3";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cles => Promise.all(cles.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (toujours la dernière version en ligne), cache en repli hors-ligne.
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith(
    fetch(request)
      .then(reponse => {
        const copie = reponse.clone();
        caches.open(CACHE).then(c => c.put(request, copie)).catch(() => {});
        return reponse;
      })
      .catch(() => caches.match(request).then(c => c || caches.match("./index.html")))
  );
});

// --- Préparé pour l'étape notifications (inactif tant qu'aucun push n'est envoyé) ---
self.addEventListener("push", event => {
  let data = { titre: "Rappel", corps: "Tu as une tâche à faire." };
  try { if (event.data) data = event.data.json(); } catch {}
  event.waitUntil(
    self.registration.showNotification(data.titre || "Rappel", {
      body: data.corps || "",
      icon: "./icon.svg",
      badge: "./icon.svg",
      data: data,
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("./"));
});
