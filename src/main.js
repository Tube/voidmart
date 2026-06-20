/* ============================================================
   VOIDMART — main.js  (bootstrap + button wiring)
   ============================================================ */
(function () {
  "use strict";
  function boot() {
    const TD = window.TD;
    TD.UI.init();
    TD.Game.init();
    TD.UI.show("startScreen");

    const $ = (id) => document.getElementById(id);
    // unlock audio on first gesture
    const unlock = () => { TD.Audio.init(); };
    document.addEventListener("pointerdown", unlock, { once: true });

    $("playBtn").addEventListener("click", () => { TD.Audio.init(); TD.Audio.start(); TD.Game.start(); });
    $("retryBtn").addEventListener("click", () => { TD.Audio.init(); TD.Audio.start(); TD.Game.start(); });
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

    // pause when tab/app is backgrounded
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && TD.Game.state === "play") TD.Game.togglePause();
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
