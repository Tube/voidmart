/* VOIDMART — service worker (offline app shell for PWA / TWA install) */
const CACHE = "voidmart-v16";
const ASSETS = [
  "./",
  "./index.html",
  "./Voidmart.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/core.js",
  "./src/billing.js",
  "./src/audio.js",
  "./src/weapons.js",
  "./src/enemies.js",
  "./src/upgrades.js",
  "./src/prizes.js",
  "./src/bodies.js",
  "./src/game.js",
  "./src/ui.js",
  "./src/main.js",
  "./icons/voidmart-icon-192.png",
  "./icons/voidmart-icon-512.png",
  "./icons/voidmart-icon-512-maskable.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // cache app shell; ignore any single failed fetch so install still succeeds
      Promise.allSettled(ASSETS.map((u) => c.add(u)))
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // runtime-cache same-origin GETs (and opportunistically Google Fonts)
          const url = new URL(req.url);
          const cacheable = url.origin === location.origin ||
            url.origin === "https://fonts.googleapis.com" ||
            url.origin === "https://fonts.gstatic.com";
          if (cacheable && res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("./Voidmart.html"));
    })
  );
});
