/* VOIDMART — service worker (offline app shell for PWA / TWA install)
   Strategy: precache the whole app shell on install (so it runs offline after the
   first online launch), then stale-while-revalidate at runtime — serve the local
   copy instantly and refresh it in the background while online, so the most recent
   grab is always stored locally and the game launches with no network. */
const CACHE = "voidmart-v68";
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
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com";
  if (!sameOrigin && !isFont) return; // leave everything else to the network

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    // refresh the local copy in the background (when online)
    const fromNetwork = fetch(req).then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) { e.waitUntil(fromNetwork); return cached; }   // stale-while-revalidate
    const fresh = await fromNetwork;
    if (fresh) return fresh;
    // offline and not cached yet → serve the app page for navigations
    if (req.mode === "navigate") return (await cache.match("./Voidmart.html")) || Response.error();
    return Response.error();
  })());
});
