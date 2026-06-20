/* ============================================================
   VOIDMART — billing.js
   Freemium entitlement. The "full unlock" (welcome ship wheel, shop
   reroll, legendary Doorbusters) is sold as a one-time managed product
   through Google Play Billing, surfaced to the web app via the Digital
   Goods API inside the Trusted Web Activity.

   Two independent sources of entitlement:
     • owned  — a REAL Play purchase. Persistent; re-confirmed from Play
                via listPurchases(). Never expires on a date change.
     • devKey — the obscured ?unlock=<digits> testing grant. Valid only
                while the digits sum to the digit-sum of the date as
                YYYYMMDD, accepting today ±1 day (local). Re-validated
                during long sessions, so a stale key re-locks itself.

   A long-running / forgotten session re-evaluates entitlement when the
   tab is refocused and hourly, so the date-key reflects the CURRENT date
   even past midnight — while a paid unlock keeps working regardless.
   ============================================================ */
(function () {
  "use strict";
  const TD = (window.TD = window.TD || {});

  // Play may key the item on the product id (underscore) or the purchase-option id
  // (hyphen — Play rejects underscores there), so we match either spelling.
  const SKUS = ["full_unlock", "full-unlock"];
  const SKU = SKUS[0];
  const STORE = "https://play.google.com/billing";
  const LS_OWNED = "voidmart_owned";      // real Play purchase (persistent)
  const LS_DEVKEY = "voidmart_devkey";    // obscured dev key (date-validated)
  const LS_LEGACY = "voidmart_unlocked";  // pre-split flag — cleared (real owners restore via Play)

  let owned = false;     // confirmed Play purchase
  let devKey = null;     // digits passed via ?unlock=, if currently held
  let unlocked = false;  // effective entitlement (owned || valid devKey)
  let service = null;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  function digitSum(v) { let s = 0; for (const ch of String(v)) { if (ch >= "0" && ch <= "9") s += +ch; } return s; }
  // digit-sum of (today + dayOffset) written YYYYMMDD, in the device's LOCAL date
  function dateSum(off) { const d = new Date(); d.setDate(d.getDate() + off); return digitSum(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()); }
  // A dev key is valid if it is all NON-ZERO digits (no "0" — so literally typing the
  // date, which contains zeros, won't work) and they sum to today's date-sum, ±1 day
  // (the ±1 covers timezone + midnight).
  function keyValid(v) { return !!v && /^[1-9]+$/.test(v) && [dateSum(-1), dateSum(0), dateSum(1)].indexOf(digitSum(v)) !== -1; }

  // Recompute effective entitlement against the CURRENT date; drop a stale dev key.
  function recompute() {
    if (devKey && !keyValid(devKey)) { devKey = null; ls.del(LS_DEVKEY); }  // refresh: stale key re-locks
    unlocked = owned || keyValid(devKey);
    return unlocked;
  }

  // --- restore persisted state ---
  owned = ls.get(LS_OWNED) === "1";
  ls.del(LS_LEGACY);                       // don't trust the old combined flag; real purchases restore via Play
  devKey = ls.get(LS_DEVKEY);

  // --- obscured dev/testing override via query string ---
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("unlock")) {
      const v = q.get("unlock");
      if (keyValid(v)) { devKey = v; ls.set(LS_DEVKEY, v); }   // grant for the current date window
      else { devKey = null; ls.del(LS_DEVKEY); }               // wrong/old key (incl. "1") clears the grant
    }
  } catch (e) {}

  recompute();

  function setUnlocked(v) {                 // test/restore hook → treated as a real purchase
    owned = !!v;
    if (owned) ls.set(LS_OWNED, "1"); else ls.del(LS_OWNED);
    recompute();
  }

  async function getService() {
    if (service) return service;
    if (!window.getDigitalGoodsService) return null;     // not in a Play TWA
    try { service = await window.getDigitalGoodsService(STORE); } catch (e) { service = null; }
    return service;
  }

  // Fetch details for whichever id Play recognizes (product id or purchase-option id).
  async function fetchItem(svc) {
    try { const d = await svc.getDetails(SKUS); if (d && d.length) return d[0]; } catch (e) {}
    return null;
  }

  // Localized price string for the unlock (e.g. "$0.99"), or null outside Play.
  async function price() {
    const svc = await getService();
    if (!svc) return null;
    const it = await fetchItem(svc);
    if (it && it.price) {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: it.price.currency })
        .format(Number(it.price.value));
    }
    return null;
  }

  // Re-confirm ownership from Play (restores after reinstall; catches a just-completed purchase).
  // Ownership is sticky once confirmed — a transient/offline empty result never revokes a paid unlock.
  async function refresh() {
    const svc = await getService();
    if (svc) {
      try {
        const purchases = await svc.listPurchases();
        if (purchases.some((p) => SKUS.indexOf(p.itemId) !== -1)) { owned = true; ls.set(LS_OWNED, "1"); }
      } catch (e) {}
    }
    return recompute();
  }

  // Were we launched from the installed Android app? A verified TWA sets the
  // referrer to android-app://<our package>. If that's true but the billing
  // service is missing, the app dropped into browser-fallback mode this launch.
  function launchedFromApp() {
    try { return /^android-app:\/\//.test(document.referrer || ""); } catch (e) { return false; }
  }
  function toast(msg, ms) { if (TD.Game && TD.Game.toast) TD.Game.toast(msg, "bad", ms); }

  // Launch the Play purchase flow. Resolves true if the unlock is owned.
  async function purchase() {
    if (unlocked) return true;
    const svc = await getService();
    if (!svc || !window.PaymentRequest) {
      if (launchedFromApp()) {
        // billing API absent inside the app → browser-fallback this launch; relaunching fixes it
        toast("⚠️ The store didn't load. Fully close VOIDMART (swipe it away) and reopen it from your home screen, then tap Unlock again.", 6000);
      } else {
        toast("⚠️ In-app purchases work in the VOIDMART app from Google Play.", 4000);
      }
      return false;
    }
    const item = await fetchItem(svc);
    if (!item) {
      // service exists but the product didn't load — usually not Active yet / still propagating
      toast("⚠️ Couldn't load the offer — try again in a moment.", 4000);
      return false;
    }
    const methodData = [{ supportedMethods: STORE, data: { sku: item.itemId || SKU } }];
    const detailsInit = { total: { label: item.title || "Full Unlock", amount: item.price } };
    try {
      const request = new PaymentRequest(methodData, detailsInit);
      const response = await request.show();
      await response.complete("success");
      owned = true; ls.set(LS_OWNED, "1"); recompute();
      if (TD.Game && TD.Game.toast) TD.Game.toast("🎉 Unlocked! Ships wheel is yours.", "good");
      return true;
    } catch (e) {
      return false; // user cancelled or payment failed
    }
  }

  // Re-evaluate during long / forgotten sessions: cheap date-key recompute on a timer,
  // and a full re-check (incl. Play) whenever the app is brought back to the foreground.
  function revalidate(full) { recompute(); if (full) refresh(); }
  try {
    if (typeof setInterval === "function") setInterval(() => revalidate(false), 60 * 60 * 1000); // hourly
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => { if (!document.hidden) revalidate(true); });
    }
  } catch (e) {}

  TD.Entitlement = {
    SKU,
    isUnlocked() { return unlocked; },
    setUnlocked,
    refresh,
    revalidate,
    purchase,
    price,
  };

  // Best-effort Play restore on load (no-op outside the Play app).
  refresh();
})();
