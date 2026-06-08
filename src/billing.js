/* ============================================================
   VOIDMART — billing.js
   Freemium entitlement. The "full unlock" (currently: the welcome
   ship wheel) is sold as a one-time managed product through Google
   Play Billing, surfaced to the web app via the Digital Goods API
   inside the Trusted Web Activity.

   Outside the Play app (plain browser) the Digital Goods API is
   absent, so the player simply stays on the free tier. Entitlement
   is cached in localStorage and re-verified from Play on launch so
   it survives reinstalls.

   Dev/testing: append ?unlock=1 to force-unlock (or ?unlock=0 to
   clear) when testing the paid path in a browser.
   ============================================================ */
(function () {
  "use strict";
  const TD = (window.TD = window.TD || {});

  const SKU = "full_unlock";                       // managed product id in Play Console
  const STORE = "https://play.google.com/billing"; // Play Billing payment method
  const LS_KEY = "voidmart_unlocked";

  let unlocked = false;
  let service = null;

  // 1) restore cached entitlement immediately (offline-friendly)
  try { unlocked = localStorage.getItem(LS_KEY) === "1"; } catch (e) {}

  // 2) obscured dev/testing override: ?unlock=<digits> only takes effect when those
  //    digits sum to the digit-sum of today's date (YYYYMMDD). This is obscurity ONLY
  //    — the rule lives in this public file; real entitlement comes from Play Billing.
  //    A non-matching value (incl. the old "1") locks, which is handy for QA.
  function digitSum(v) { let s = 0; for (const ch of String(v)) { if (ch >= "0" && ch <= "9") s += +ch; } return s; }
  function todaysDateKey() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("unlock")) {
      const v = q.get("unlock");
      const ok = /\d/.test(v) && digitSum(v) === digitSum(todaysDateKey());
      unlocked = ok;
      try { localStorage.setItem(LS_KEY, ok ? "1" : "0"); } catch (e) {}
    }
  } catch (e) {}

  function setUnlocked(v) {
    unlocked = !!v;
    try { localStorage.setItem(LS_KEY, unlocked ? "1" : "0"); } catch (e) {}
  }

  async function getService() {
    if (service) return service;
    if (!window.getDigitalGoodsService) return null;     // not in a Play TWA
    try { service = await window.getDigitalGoodsService(STORE); } catch (e) { service = null; }
    return service;
  }

  // Localized price string for the unlock (e.g. "$0.99"), or null outside Play.
  async function price() {
    const svc = await getService();
    if (!svc) return null;
    try {
      const d = await svc.getDetails([SKU]);
      const it = d && d[0];
      if (it && it.price) {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: it.price.currency })
          .format(Number(it.price.value));
      }
    } catch (e) {}
    return null;
  }

  // Re-verify ownership from Play (restores entitlement after reinstall).
  async function refresh() {
    const svc = await getService();
    if (!svc) return unlocked;
    try {
      const purchases = await svc.listPurchases();
      const owned = purchases.some((p) => p.itemId === SKU);
      if (owned) setUnlocked(true);
    } catch (e) {}
    return unlocked;
  }

  // Launch the Play purchase flow. Resolves true if the unlock is owned.
  async function purchase() {
    if (unlocked) return true;
    const svc = await getService();
    if (!svc || !window.PaymentRequest) {
      if (TD.Game && TD.Game.toast) TD.Game.toast("⚠️ Unlock is only available in the Play Store app.", "bad");
      return false;
    }
    let item = null;
    try { const d = await svc.getDetails([SKU]); item = d && d[0]; } catch (e) {}
    if (!item) return false;
    const methodData = [{ supportedMethods: STORE, data: { sku: SKU } }];
    const detailsInit = { total: { label: item.title || "Full Unlock", amount: item.price } };
    try {
      const request = new PaymentRequest(methodData, detailsInit);
      const response = await request.show();
      await response.complete("success");
      setUnlocked(true);
      if (TD.Game && TD.Game.toast) TD.Game.toast("🎉 Unlocked! Ships wheel is yours.", "good");
      return true;
    } catch (e) {
      return false; // user cancelled or payment failed
    }
  }

  TD.Entitlement = {
    SKU,
    isUnlocked() { return unlocked; },
    setUnlocked,
    refresh,
    purchase,
    price,
  };

  // Best-effort restore on load (no-op outside the Play app).
  refresh();
})();
