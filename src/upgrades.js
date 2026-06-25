/* ============================================================
   VOIDMART — upgrades.js
   The bargain-bin upgrade catalog. Each "deal" mutates ship.stats
   or swaps the weapon. Rarities drive the shop styling & roll odds.
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;
  const M = TD.math;

  // fake "units sold" flavour per rarity
  const SOLD = {
    common: () => (M.randInt(4, 39) + "k sold"),
    rare: () => (M.randInt(800, 9000) + " sold"),
    epic: () => (M.randInt(60, 600) + " sold"),
    legendary: () => (M.randInt(3, 40) + " left!"),
  };
  const STARS = { common: "★★★☆☆", rare: "★★★★☆", epic: "★★★★½", legendary: "★★★★★" };
  const PRICE = { common: [9, 29], rare: [49, 129], epic: [199, 499], legendary: [899, 1999] };

  // helper to declare an upgrade
  function U(o) {
    o.weight = o.weight == null ? 1 : o.weight;
    o.max = o.max == null ? 1 : o.max;
    o.dept = o.dept || "Add-ons";
    o.door = o.rarity === "legendary";   // the rare "Doorbuster" tier (incl. chain lightning + blink) → one per game
    return o;
  }

  // weapon-swap factory
  function weaponDeal(id, name, icon, desc, rarity) {
    return U({
      id, name, icon, desc, rarity, dept: "Weapons", max: 1,
      prereq: (s) => s.stats.weapon !== id,
      apply: (s) => { s.stats.weapon = id; s.weaponTier = 0; },   // a fresh weapon starts at tier 1 (base)
    });
  }

  const LIST = [
    /* ---------------- WEAPONS (swaps) ---------------- */
    weaponDeal("split", "Forklift Spread™", "🍴", "Hurls a wide fan of 3 pellets. Great for crowds, terrible for posture.", "epic"),
    weaponDeal("flak", "Bargain Buckshot", "💥", "Close-range cloud of cheap shrapnel. Melts anything in your face.", "epic"),
    weaponDeal("pulse", "Laser Pointer™", "🔦", "Rapid piercing bolts. Also great for annoying cats across the galaxy.", "epic"),
    weaponDeal("rail", "Knock-off Railgun", "🛰️", "Slow, enormous piercing slug. Recoil not included… it's included.", "epic"),
    weaponDeal("missiles", "Homing Air-Pods", "🎧", "Self-guiding missiles that chase deals (and enemies) for you.", "epic"),
    weaponDeal("blades", "Boomerang Spatula", "🪃", "Spinning blades that fly out and come right back. Mostly.", "epic"),
    weaponDeal("arc", "Static-Sock Zapper", "🧦", "Lightning that chains between nearby foes. Some assembly required.", "legendary"),

    /* ---------------- OFFENCE (Add-ons) ---------------- */
    U({ id: "firerate", name: "Overclocked Trigger", icon: "⏱️", dept: "Add-ons", rarity: "common", max: 7,
        desc: "+9% fire rate. Voids warranty on impact.", apply: (s) => s.stats.fireRate *= 1.09 }),
    U({ id: "damage", name: "Bootleg Gunpowder", icon: "🧨", dept: "Add-ons", rarity: "common", max: 8,
        desc: "+16% damage. Smells faintly of regret.", apply: (s) => s.stats.damage *= 1.16 }),
    U({ id: "projspeed", name: "Aftermarket Barrel", icon: "🛢️", dept: "Add-ons", rarity: "common", max: 4,
        desc: "+28% projectile speed. Friction is for the rich.", apply: (s) => s.stats.projSpeed *= 1.28 }),
    U({ id: "multishot", name: "Buy-One-Get-One", icon: "➕", dept: "Add-ons", rarity: "rare", max: 4, weight: 1.1,
        desc: "+1 projectile on every shot. BOGO forever.",
        descFor: (s) => (s.chassis && s.chassis.dronesForProj) ? "+1 orbiting drone instead — your drones do the shooting. BOGO forever." : null,
        apply: (s) => { if (s.chassis && s.chassis.dronesForProj) s.addDrone(); else s.stats.projAdd += 1; } }),
    U({ id: "pierce", name: "Sketchy Hollowpoints", icon: "🎯", dept: "Add-ons", rarity: "rare", max: 4,
        desc: "+1 pierce. Goes through enemies AND store policy.", apply: (s) => s.stats.pierce += 1 }),
    U({ id: "crit", name: "Lucky Scratch-Off", icon: "🎟️", dept: "Add-ons", rarity: "rare", max: 5,
        desc: "+9% crit chance. You feel lucky. You aren't, but you feel it.", apply: (s) => s.stats.critChance += 0.09 }),
    U({ id: "critdmg", name: "Counterfeit Diamond Tips", icon: "💎", dept: "Add-ons", rarity: "epic", max: 4,
        desc: "+0.6× crit damage. Cubic zirconia, honestly.", apply: (s) => s.stats.critMult += 0.6 }),
    U({ id: "homing", name: "Knock-off Heat-Seeker", icon: "🧲", dept: "Add-ons", rarity: "epic", max: 1,
        desc: "All your shots gently curve toward enemies.", apply: (s) => s.stats.homing = Math.max(s.stats.homing, 1) }),
    U({ id: "splash", name: "Definitely-Not-TNT", icon: "🔥", dept: "Add-ons", rarity: "epic", max: 3,
        desc: "Hits explode in a small blast. Definitely not TNT.", apply: (s) => { s.stats.splash += 30 * TD.Screen.unit; s.stats.splashDmg += 0.4; } }),

    /* ---------------- FORCE FIELDS (defence) ---------------- */
    U({ id: "shieldmax", name: "Bubble-Wrap Field", icon: "🫧", dept: "Force Fields", rarity: "common", max: 6,
        desc: "+30 max field. Pop-resistant. Mostly.", apply: (s) => { s.stats.maxShield += 30; s.shield += 30; } }),
    U({ id: "shieldregen", name: "Fast-Charge Knockoff", icon: "🔋", dept: "Force Fields", rarity: "common", max: 5,
        desc: "+6/s field recharge. Cable sold separately.", apply: (s) => s.stats.shieldRegen += 6 }),
    U({ id: "shielddelay", name: "No-Questions Warranty", icon: "📜", dept: "Force Fields", rarity: "rare", max: 3,
        desc: "Field starts recharging 0.6s sooner after a hit.", apply: (s) => s.stats.shieldDelay = Math.max(0.4, s.stats.shieldDelay - 0.6) }),
    U({ id: "reflect", name: "Reflecto-Wrap", icon: "🪞", dept: "Force Fields", rarity: "epic", max: 1,
        desc: "Your field bounces enemy shots back as your own.", apply: (s) => s.stats.reflect = true }),
    U({ id: "thorns", name: "Static-Cling Halo", icon: "⚡", dept: "Force Fields", rarity: "epic", max: 3,
        desc: "A crackling aura damages anything that hugs you.", apply: (s) => s.stats.thorns += 26 }),
    U({ id: "dodge", name: "Phantom Return Policy", icon: "👻", dept: "Force Fields", rarity: "rare", max: 4,
        desc: "+12% chance to phase through a hit entirely.", apply: (s) => s.stats.dodge = Math.min(0.6, s.stats.dodge + 0.12) }),
    U({ id: "fielddr", name: "Packing Peanuts", icon: "🥜", dept: "Force Fields", rarity: "rare", max: 5,
        desc: "While your field is up, every hit deals 5 less damage (stacks to −25). Ships safely.",
        apply: (s) => { s.stats.fieldFlatDR = Math.min(s.mods.fielddr || 1, 5) * 5; } }),
    U({ id: "blink", name: "Time-Limited Warp", icon: "🌀", dept: "Force Fields", rarity: "legendary", max: 1,
        desc: "When your field breaks, blink to safety, briefly invincible.", apply: (s) => s.stats.blink = true }),

    /* ---------------- HULL & BODY ---------------- */
    U({ id: "hullmax", name: "Reinforced Cardboard", icon: "📦", dept: "Hull & Body", rarity: "common", max: 6,
        desc: "+40 max hull. Now double-corrugated!", apply: (s) => { s.stats.maxHull += 40; s.hull += 40; } }),
    U({ id: "speed", name: "Off-Brand Energy Drink", icon: "🥤", dept: "Hull & Body", rarity: "common", max: 5,
        desc: "+12% top speed & thrust. Tastes like batteries.", apply: (s) => { s.stats.moveSpeed *= 1.12; s.stats.thrust *= 1.12; } }),
    U({ id: "turn", name: "Greased Bearings", icon: "🛞", dept: "Hull & Body", rarity: "common", max: 4,
        desc: "+22% turn rate. Suspiciously oily.", apply: (s) => s.stats.turn *= 1.22 }),
    U({ id: "ram", name: "Spite-Powered Ram", icon: "🐏", dept: "Hull & Body", rarity: "rare", max: 3,
        desc: "Ramming deals heavy damage & you shrug off the bump.", apply: (s) => { s.stats.bodyDmg += 40; s.stats.ramArmor += 0.35; } }),
    U({ id: "regen", name: "Suspicious Supplements", icon: "💊", dept: "Hull & Body", rarity: "rare", max: 3,
        desc: "+2.5/s hull regen. Not FDA approved. Not anything approved.", apply: (s) => s.stats.hullRegen += 2.5 }),
    U({ id: "lifesteal", name: "Vampire Mods (Used)", icon: "🩸", dept: "Hull & Body", rarity: "epic", max: 3,
        desc: "Heal hull for 6% of damage you deal. Previously owned.", apply: (s) => s.stats.lifesteal += 0.06 }),
    U({ id: "hpcap", name: "Liability Cap™", icon: "🧯", dept: "Hull & Body", rarity: "epic", max: 3, weight: 0.6,
        desc: "Hull can't lose more than 40%→35%→30% of max HP per ½s (stacks, max 3). Field unaffected.",
        apply: (s) => { const lvl = Math.min(s.mods.hpcap || 1, 3); s.stats.hullDmgCap = [0.40, 0.35, 0.30][lvl - 1]; } }),

    /* ---------------- ADD-ONS (utility) ---------------- */
    U({ id: "magnet", name: "Industrial Coin Magnet", icon: "🧲", dept: "Add-ons", rarity: "common", max: 4,
        desc: "+70% coin pickup range. Attracts coins & lawsuits.", apply: (s) => s.stats.pickup *= 1.7 }),
    U({ id: "xp", name: "Loyalty Points ×2", icon: "🎖️", dept: "Add-ons", rarity: "rare", max: 4,
        desc: "+30% coin value toward checkout. Members only.", apply: (s) => s.stats.xp *= 1.3 }),
    U({ id: "drone", name: "Drone Buddy (Refurb.)", icon: "🤖", dept: "Add-ons", rarity: "epic", max: 4, weight: 1.1,
        desc: "A little refurbished drone orbits & shoots for you.", apply: (s) => s.addDrone() }),
    U({ id: "jackpot", name: "Everything-Free Friday", icon: "🎉", dept: "Add-ons", rarity: "legendary", max: 2,
        desc: "+1 projectile, +12% damage AND +12% fire rate. Doorbuster!",
        descFor: (s) => (s.chassis && s.chassis.dronesForProj) ? "+1 drone, +12% damage AND +12% fire rate. Doorbuster!" : null,
        apply: (s) => { if (s.chassis && s.chassis.dronesForProj) s.addDrone(); else s.stats.projAdd += 1; s.stats.damage *= 1.12; s.stats.fireRate *= 1.12; } }),

    /* ---------------- DOORBUSTERS (legendary — paid players only) ---------------- */
    U({ id: "multipack", name: "Bulk-Buy Multipack", icon: "📦", dept: "Add-ons", rarity: "legendary", max: 1,
        desc: "+2 projectiles, every shot. Why buy one bullet? Doorbuster!",
        descFor: (s) => (s.chassis && s.chassis.dronesForProj) ? "+2 drones, all yours. Why buy one bullet? Doorbuster!" : null,
        apply: (s) => { if (s.chassis && s.chassis.dronesForProj) { s.addDrone(); s.addDrone(); } else s.stats.projAdd += 2; } }),
    U({ id: "finalmarkdown", name: "Final Markdown", icon: "💯", dept: "Add-ons", rarity: "legendary", max: 1,
        desc: "+20% crit chance and +1× crit damage. Everything must crit. Doorbuster!",
        apply: (s) => { s.stats.critChance += 0.20; s.stats.critMult += 1.0; } }),
    U({ id: "warranty", name: "Extended Protection Plan™", icon: "🛡️", dept: "Force Fields", rarity: "legendary", max: 1,
        desc: "+60 field, +10/s recharge, near-instant reboot. Fully covered. Doorbuster!",
        apply: (s) => { s.stats.maxShield += 60; s.shield += 60; s.stats.shieldRegen += 10; s.stats.shieldDelay = Math.max(0.3, s.stats.shieldDelay - 0.8); } }),
    U({ id: "rewardscard", name: "Blood Rewards Card", icon: "🩸", dept: "Hull & Body", rarity: "legendary", max: 1,
        desc: "Heal 12% of all damage dealt + steady hull regen. Membership has its perks. Doorbuster!",
        apply: (s) => { s.stats.lifesteal += 0.12; s.stats.hullRegen += 4; } }),
    U({ id: "swarm", name: "Refurb Drone Swarm", icon: "🤖", dept: "Add-ons", rarity: "legendary", max: 1,
        desc: "THREE refurbished drones orbit and fire — all at once. Doorbuster!",
        apply: (s) => { s.addDrone(); s.addDrone(); s.addDrone(); } }),

    /* ---------------- ENDLESS RESTOCK (never sell out — keeps the shop full for marathon runs) ----------------
       Low weight so they're rare while the real catalog still has stock, but they have no cap, so once
       everything else is maxed these are all that's left and the shelves are never bare. */
    U({ id: "endless_pow", name: "Doubling Down", icon: "🔁", dept: "Add-ons", rarity: "epic", max: Infinity, endless: true, weight: 0.5,
        desc: "+6% damage and +6% fire rate. Always restocked.",
        apply: (s) => { s.stats.damage *= 1.06; s.stats.fireRate *= 1.06; } }),
    U({ id: "endless_def", name: "Overstock Plating", icon: "🧱", dept: "Hull & Body", rarity: "epic", max: Infinity, endless: true, weight: 0.5,
        desc: "+25 max hull and +18 max field. Never out of stock.",
        apply: (s) => { s.stats.maxHull += 25; s.hull += 25; s.stats.maxShield += 18; s.shield += 18; } }),
    U({ id: "endless_coin", name: "Compounding Interest", icon: "🧾", dept: "Add-ons", rarity: "epic", max: Infinity, endless: true, weight: 0.5,
        desc: "+8% coin value and +6% pickup range. Always available.",
        apply: (s) => { s.stats.coinDrop *= 1.08; s.stats.pickup *= 1.06; } }),
  ];

  const BY_ID = {};
  LIST.forEach((u) => (BY_ID[u.id] = u));

  // legendary kept "rare as hell" — low base weight; total legendary odds stay low even
  // though there are now several of them (and at most one can appear per offer, see roll()).
  const RARITY_W = { common: 100, rare: 42, epic: 15, legendary: 3 };

  const Upgrades = {
    LIST, BY_ID, SOLD, STARS, PRICE,
    // roll n distinct offers, weighted; better odds at higher level
    roll(ship, n) {
      n = n || 3;
      const lvl = ship.game.level;
      // how many picks the player already owns in each department (build reinforcement)
      const deptInvest = {};
      for (const id in ship.mods) {
        const def = BY_ID[id];
        // endless restock picks don't reinforce their department — otherwise stacking them snowballs their own odds
        if (def && !def.endless) deptInvest[def.dept] = (deptInvest[def.dept] || 0) + ship.mods[id];
      }
      // legendary "Doorbuster" deals are a paid perk — excluded for free players.
      const paid = !!(TD.Entitlement && TD.Entitlement.isUnlocked());
      // one Doorbuster per game: once any Doorbuster is owned, no more are offered this run
      const ownsDoorbuster = LIST.some((u) => u.door && (ship.mods[u.id] || 0) > 0);
      const cands = [];
      for (const u of LIST) {
        const have = ship.mods[u.id] || 0;
        if (have >= u.max) continue;
        if (u.rarity === "legendary" && !paid) continue;   // legendaries (incl. Doorbusters) are paid-only
        if (u.door && ownsDoorbuster) continue;            // ...and only one Doorbuster per run
        // per-hull store exclusions (e.g. Hover Cart hides +turn — its turn is already maxed)
        if (ship.chassis && ship.chassis.exclude && ship.chassis.exclude.indexOf(u.id) !== -1) continue;
        if (u.prereq && !u.prereq(ship)) continue;
        let w = (RARITY_W[u.rarity] || 10) * u.weight;
        // scale rare+ odds up as you progress
        if (u.rarity === "epic") w *= 1 + lvl * 0.05;
        if (u.rarity === "legendary") w *= 1 + lvl * 0.08;
        if (u.rarity === "rare") w *= 1 + lvl * 0.02;
        // bias toward departments the player has already bought into
        // (skip Weapons — your weapon is a one-time identity choice, not a stack)
        if (u.dept !== "Weapons") {
          const inv = deptInvest[u.dept] || 0;
          w *= 1 + Math.min(inv * 0.35, 1.4);
        }
        // never let owning an endless upgrade raise its own odds — each copy you hold makes the next one rarer
        if (u.endless) w /= 1 + have;
        cands.push({ u, w });
      }
      const out = [];
      for (let k = 0; k < n && cands.length; k++) {
        let tot = 0; for (const c of cands) tot += c.w;
        let r = Math.random() * tot, idx = 0;
        for (let i = 0; i < cands.length; i++) { if ((r -= cands[i].w) <= 0) { idx = i; break; } }
        const chosen = cands[idx].u;
        out.push(chosen);
        cands.splice(idx, 1);
        // never offer two Doorbusters at once — drop the rest of the legendaries
        if (chosen.rarity === "legendary") {
          for (let i = cands.length - 1; i >= 0; i--) if (cands[i].u.rarity === "legendary") cands.splice(i, 1);
        }
      }
      return out;
    },
    priceFor(u) {
      const [a, b] = PRICE[u.rarity];
      const old = M.randInt(a, b);
      const off = M.randInt(72, 99);
      return { old: old + ".99", off };
    },
  };

  TD.Upgrades = Upgrades;
})();
