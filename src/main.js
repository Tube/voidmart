/* ============================================================
   VOIDMART — main.js  (bootstrap + button wiring)
   ============================================================ */
(function () {
  "use strict";

  // Keep the device screen awake during play (Screen Wake Lock API). The OS auto-releases
  // the lock whenever the app is backgrounded, so we re-acquire it on return / on play.
  let wakeLock = null;
  async function keepAwake() {
    if (!("wakeLock" in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch (e) { /* denied (e.g. low battery, not focused) — harmless, screen just sleeps as usual */ }
  }

  // Origin guard — cheap anti-bootleg deterrent. If the files are served from anywhere other than our
  // real domains (i.e. someone copied them to their own site), cover everything with a splash that points
  // players to the genuine article and don't start the game. It's pure client-side obscurity — a copier can
  // delete this — but it brands every lazy rip and costs legit players (always on voidmart.app) nothing.
  function originGuard() {
    const host = location.hostname;
    const ok =
      host === "voidmart.app" || host === "www.voidmart.app" ||
      host === "localhost" || host === "127.0.0.1" || host === "" ||  // local dev / file://
      /\.github\.io$/.test(host);                                      // Pages default domain
    if (ok) return false;
    const o = document.createElement("div");
    o.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:18px;text-align:center;padding:24px;" +
      "background:#05060f;color:#fff;font-family:'Baloo 2',system-ui,sans-serif";
    o.innerHTML =
      '<div style="font-size:13px;letter-spacing:3px;color:#ff2d6a;font-weight:800">BOOTLEG COPY</div>' +
      '<div style="font-size:32px;font-weight:800;color:#37f0ff;text-shadow:0 0 18px #37f0ff">VOIDMART</div>' +
      '<div style="font-size:16px;max-width:420px;line-height:1.5;opacity:.9">This is an unofficial copy. Play the real thing — free — at the official site.</div>' +
      '<a href="https://voidmart.app" style="margin-top:6px;padding:14px 26px;border-radius:14px;' +
      'background:#37f0ff;color:#05060f;font-weight:800;font-size:18px;text-decoration:none;' +
      'box-shadow:0 0 24px rgba(55,240,255,.6)">▶ Play at voidmart.app</a>';
    (document.body || document.documentElement).appendChild(o);
    return true;
  }

  function boot() {
    if (originGuard()) return;   // bootleg origin → splash only, never boot the game
    const TD = window.TD;
    TD.UI.init();
    TD.Game.init();
    TD.UI.show("startScreen");

    const $ = (id) => document.getElementById(id);
    // unlock audio on first gesture + kick off the music bed (mode auto-tracks game state)
    const unlock = () => { TD.Audio.init(); TD.Audio.startMusic(); };
    document.addEventListener("pointerdown", unlock, { once: true });

    $("playBtn").addEventListener("click", () => { keepAwake(); TD.Audio.init(); TD.Audio.start(); TD.Game.start(); });
    $("retryBtn").addEventListener("click", () => { keepAwake(); TD.Audio.init(); TD.Audio.start(); TD.Game.start(); });
    $("rerollBtn").addEventListener("click", () => { TD.Audio.reroll(); TD.Game.rerollShop(); });
    $("spinBtn").addEventListener("click", () => { TD.UI.onSpin(); });
    const skipBtn = $("wheelSkipBtn");
    if (skipBtn) skipBtn.addEventListener("click", () => { TD.Audio.ui(); TD.UI.skipWheel(); });
    $("pauseBtn").addEventListener("click", () => { TD.Audio.ui(); TD.Game.togglePause(); });
    $("muteBtn").addEventListener("click", () => {
      const on = !TD.Audio.enabled;
      TD.Audio.setEnabled(on);
      $("muteBtn").textContent = on ? "🔊" : "🔇";
      if (on) TD.Audio.ui();
    });

    // pause when tab/app is backgrounded; re-arm the screen wake lock on return to a live run
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { if (TD.Game.state === "play") TD.Game.togglePause(); }
      else if (TD.Game.state !== "menu" && TD.Game.state !== "over") keepAwake();
    });

    // If the installed app launched into browser-tab fallback, nudge the player to relaunch
    // up front (so they fix it before a run / before hitting the unlock). Web players never see this.
    if (TD.Entitlement && TD.Entitlement.inAppFallback && TD.Entitlement.inAppFallback()) {
      setTimeout(() => TD.UI.toast("⚠️ Opened in browser mode. Close VOIDMART fully (swipe it away) and reopen for the full-screen app.", "bad", 7000), 600);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // register the service worker (offline / installable PWA)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
