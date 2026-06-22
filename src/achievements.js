/* ============================================================
   VOIDMART — achievements.js
   Local-only, NO tracking. Unlocked achievements are stored in
   localStorage on the player's own device and never leave it.
   Themed to avoid morbid wording (no "dead/kill/die" etc.).
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;
  const KEY = "voidmart_achv";

  // per-hull flavour: [icon, title] for ending a run while flying that chassis
  const HULL_ACH = {
    balanced: ["🍀", "Luck Ran Out"],
    offense:  ["🗡️", "Shattered Glass"],
    defense:  ["🛡️", "Breached Bunker"],
    ramming:  ["🐏", "Out of Bounce"],
    cannon:   ["💥", "Siege Lifted"],
    saucer:   ["🛸", "Grounded"],
    carrier:  ["🛞", "Flat Tire"],
    default:  ["🛒", "Clearance Rack"],
  };

  const Achv = {
    DEFS: [], _hullIds: [], _set: null,
    _build() {
      if (this.DEFS.length) return;
      const B = TD.BODIES;
      for (const id in HULL_ACH) {
        const b = B && B.BY_ID[id];
        if (!b) continue;
        const [icon, title] = HULL_ACH[id];
        this.DEFS.push({ id: "out_" + id, name: title, icon, rarity: "common", hull: id,
          desc: "End a run flying the " + b.name + "." });
        this._hullIds.push("out_" + id);
      }
      this.DEFS.push({ id: "out_all", name: "Everything Must Go", icon: "🏷️", rarity: "rare",
        desc: "End a run in every hull in the catalog." });
      this.DEFS.push({ id: "bought_farm", name: "Bought the Farm", icon: "🚜", rarity: "epic",
        desc: "Bow out with 100,000+ points." });
    },
    load() {
      if (this._set) return this._set;
      try { this._set = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { this._set = {}; }
      return this._set;
    },
    has(id) { return !!this.load()[id]; },
    unlock(id) {
      this.load();
      if (this._set[id]) return false;          // already earned
      this._set[id] = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(this._set)); } catch (_) {}
      return true;                              // newly earned
    },
    def(id) { this._build(); return this.DEFS.find((d) => d.id === id); },
    all() { this._build(); return this.DEFS.slice(); },
    progress() { this._build(); this.load(); return { earned: this.DEFS.filter((d) => this._set[d.id]).length, total: this.DEFS.length }; },

    // Evaluate at the end of a run. Returns the list of NEWLY-unlocked achievement defs.
    evaluateGameOver(game) {
      this._build(); this.load();
      const newly = [];
      const earn = (id) => { const d = this.def(id); if (d && this.unlock(id)) newly.push(d); };
      const hid = game.ship && game.ship.chassis && game.ship.chassis.id;
      if (hid && this.def("out_" + hid)) earn("out_" + hid);
      if (this._hullIds.every((id) => this._set[id])) earn("out_all");   // flown every hull to its end
      if ((game.score || 0) >= 100000) earn("bought_farm");
      return newly;
    },
  };

  TD.Achievements = Achv;
})();
