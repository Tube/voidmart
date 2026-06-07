# Handoff: VOIDMART → Android (Google Play)

## Overview
**VOIDMART** is a complete, working browser game — a one-finger, touch-first knock-off
"bargain-bin" space shooter (Asteroids-style inertial flight + roguelite build-crafting).
It is **not a design mock**: it is the finished product, a self-contained
HTML/CSS/JS Progressive Web App with **no backend, no build step, and no npm
dependencies**. The only network requests are to Google Fonts (and those are cached by
the service worker for offline play).

**The task is NOT to rewrite the game.** It is to **package the existing PWA into an
installable Android app (.aab) for the Google Play Store**, using a Trusted Web Activity
(TWA) wrapper. The game code ships as-is.

## Recommended path: Bubblewrap (TWA)
A TWA runs the PWA full-screen in an Android shell with no browser chrome. This is
Google's recommended way to put a PWA on Play, and it keeps the game code untouched.

### What's already done (in this bundle)
- `manifest.webmanifest` — valid PWA manifest (name, icons, `display: fullscreen`,
  `theme_color #ff6a13`, `background_color #05050f`, maskable icon included).
- `sw.js` — service worker that caches the full app shell for offline play; registered
  from `src/main.js`.
- `icons/` — 192, 512, and 512 **maskable** PNG app icons.
- `store/feature-graphic.png` — 1024×500 Play listing feature graphic.
- Touch controls, responsive scaling to any screen, and safe-area insets are all handled.

### Prerequisites (developer's machine)
- Node.js 18+ and the Bubblewrap CLI: `npm i -g @bubblewrap/cli`
- JDK 17 and the Android SDK (Android Studio is the easiest way to get both)
- A **publicly hosted HTTPS URL** serving these files (TWA loads the PWA from the web).
  Any static host works — GitHub Pages, Netlify, Cloudflare Pages, Firebase Hosting.
  The whole project is static; just upload the folder as-is.

### Steps
1. **Host the PWA.** Deploy this folder to a static HTTPS host so that
   `https://<your-domain>/Voidmart.html` and `https://<your-domain>/manifest.webmanifest`
   are publicly reachable. Confirm Chrome DevTools → Application shows the manifest and an
   active service worker, and that Lighthouse → PWA is installable.
   - Note: `start_url` / `scope` in the manifest are currently `./Voidmart.html` and `./`.
     If you host the game at the domain root, consider changing `start_url` to `./` or
     `./Voidmart.html` to match where you deploy. Keep `scope` covering the game files.
2. **Init the TWA project:**
   `bubblewrap init --manifest https://<your-domain>/manifest.webmanifest`
   - Accept/curate: app name **VOIDMART**, package id e.g. `com.<you>.voidmart`,
     display mode **fullscreen**, orientation **default** (the game handles any size),
     theme color `#ff6a13`, background `#05050f`.
3. **Build the bundle:** `bubblewrap build` → produces `app-release-bundle.aab` (and an
   APK for local testing). Bubblewrap generates a signing key on first build — **back it
   up**; you need the same key for every future update.
4. **Digital Asset Links (removes the URL bar):** Bubblewrap prints an
   `assetlinks.json`. Host it at `https://<your-domain>/.well-known/assetlinks.json` so
   Android verifies the app owns the domain and runs it chrome-free.
5. **Test on a device:** `bubblewrap install` (or `adb install app-release.apk`).
6. **Publish:** In Google Play Console, create the app, upload the `.aab`, attach the
   512 icon and `store/feature-graphic.png`, add phone screenshots, fill content rating +
   data-safety (this game collects **no** data — declare accordingly), and submit.

### Alternative (no CLI): PWABuilder
`https://www.pwabuilder.com` → enter the hosted URL → "Package for stores" → Android →
download the signed `.aab` + `assetlinks.json`. Same hosting prerequisite; no local
Android SDK needed.

## Things the developer must provide (cannot be bundled)
- A Google Play Developer account (one-time $25). Personal accounts must run a
  ~12-tester / 14-day closed test before production.
- A privacy policy URL (required even though the game collects no data).
- The signing keystore must be created and safely retained by the developer.

## Offline / caching notes
- `sw.js` uses cache-first for the listed app-shell assets and runtime-caches Google
  Fonts. If you change asset filenames, update the `ASSETS` array and bump the `CACHE`
  constant (`voidmart-v1` → `-v2`) so clients pick up the new shell.

## Files in this bundle
- `Voidmart.html` — entry point (loads everything below).
- `manifest.webmanifest` — PWA manifest.
- `sw.js` — service worker (offline shell).
- `src/` — game code: `core.js, audio.js, weapons.js, enemies.js, upgrades.js,
  prizes.js, bodies.js, game.js, ui.js, styles.css, main.js`.
- `icons/` — app icons (192, 512, 512-maskable, 1024 master).
- `store/feature-graphic.png` — 1024×500 Play feature graphic.

## Verifying it runs (before packaging)
Open `Voidmart.html` over **http(s)** (not `file://`, or the service worker won't
register). Tap **SHOP NOW**, spin the welcome wheel for a ship, and confirm touch-drag
flight works. No console errors should appear.
