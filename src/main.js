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

  function boot() {
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
