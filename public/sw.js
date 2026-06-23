const CACHE_NAME = "svoya-game-v6";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/client.js",
  "/manifest.webmanifest",
  "/privacy.html",
  "/terms.html",
  "/safety.html",
  "/assets/team1.jpeg",
  "/assets/team2.jpeg",
  "/assets/icon-192.svg",
  "/assets/icon-512.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => null);
      return res;
    }).catch(() => cached))
  );
});