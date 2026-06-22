/* ============================================================
   VOIDMART — weapons.js
   Weapon catalog + projectile spawning. Each weapon swap is a
   knock-off "product". Stats from ship.stats modify everything.
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;
  const M = TD.math;

  // Make a projectile object (pushed into game.projectiles)
  function P(o) {
    return Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, r: 4, dmg: 10,
      life: 1.2, maxLife: 1.2, pierce: 0, hits: null, dead: false,
      color: "#37f0ff", glow: 14, kind: "bolt", angle: 0,
      homing: 0, turnRate: 4, target: null, spin: 0, crit: false,
      ret: false, retT: 0, owner: null, splash: 0,
    }, o);
  }

  // helper: nearest enemy to (x,y) within optional max range
  function nearestEnemy(game, x, y, maxD, exclude) {
    let best = null, bd = maxD ? maxD * maxD : Infinity;
    const W = TD.Screen.W, H = TD.Screen.H;
    for (const e of game.enemies) {
      if (e.dead || e === exclude || (exclude && exclude.has && exclude.has(e))) continue;
      const dl = M.wrapDelta(x, y, e.x, e.y, W, H);
      const d2 = dl.dx * dl.dx + dl.dy * dl.dy;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  // Spawn `n` bolts in a fan around base angle `ang` with arc `spread`
  function fan(game, s, n, ang, spread, speed, mk) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = ang + (t - 0.5) * spread;
      const u = TD.Screen.unit;
      const muzzle = (s.r + 4) * u;
      const px = s.x + Math.cos(ang) * muzzle, py = s.y + Math.sin(ang) * muzzle;
      const crit = M.chance(s.stats.critChance);
      const pr = mk(a, px, py, speed, crit);
      game.projectiles.push(pr);
      game.flashMuzzle(px, py, ang, pr.color);
    }
  }

  // shared bolt damage calc
  function dmgOf(s, base, crit) {
    let d = base * s.stats.damage * (s.damageMul || 1);
    if (crit) d *= s.stats.critMult;
    return d;
  }

  // total fan arc: each extra projectile widens it ~20°, so 10 shots span ~180°. Capped at a half-circle
  // so shots never fire sideways/backwards. `base` is the weapon's own no-upgrade spread.
  const SHOT_GAP = Math.PI / 9;
  function projSpread(s, base) {
    return Math.min(Math.PI, (base || 0) + s.stats.projAdd * SHOT_GAP) + s.stats.spread;
  }

  /* ============== WEAPON CATALOG ============== */
  const WEAPONS = {
    /* default — Pea Shooter */
    blaster: {
      name: "Pea-Shooter Mk0", icon: "🔫", rate: 3.4, spread: 0.10,
      fire(game, s) {
        const u = TD.Screen.unit;
        const n = 1 + s.stats.projAdd;
        const spread = projSpread(s, 0);
        const speed = 640 * s.stats.projSpeed * u;
        fan(game, s, n, s.angle, n > 1 ? spread : 0, speed, (a, px, py, sp, crit) =>
          P({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              r: 4.4 * u, dmg: dmgOf(s, 10, crit), life: 1.1, maxLife: 1.1,
              pierce: s.stats.pierce, hits: new Set(), color: "#7ef9ff", glow: 12,
              crit, homing: s.stats.homing, splash: s.stats.splash }));
      },
    },
    /* Forklift Spread — split shot */
    split: {
      name: "Forklift Spread™", icon: "🍴", rate: 2.7, spread: 0.42,
      fire(game, s) {
        const u = TD.Screen.unit, t2 = s.weaponTier > 0;
        const n = (t2 ? 5 : 3) + s.stats.projAdd;        // PRO: wider 5-pellet fan
        const speed = 600 * s.stats.projSpeed * u;
        fan(game, s, n, s.angle, projSpread(s, this.spread + (t2 ? 0.12 : 0)), speed, (a, px, py, sp, crit) =>
          P({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              r: 4.2 * u, dmg: dmgOf(s, 8, crit), life: 1.0, maxLife: 1.0,
              pierce: s.stats.pierce + (t2 ? 1 : 0), hits: new Set(), color: t2 ? "#d6ff8a" : "#b6ff6a", glow: t2 ? 13 : 11,
              crit, homing: s.stats.homing, splash: s.stats.splash }));
      },
    },
    /* Bargain Buckshot — flak */
    flak: {
      name: "Bargain Buckshot", icon: "💥", rate: 1.7, spread: 0.95,
      fire(game, s) {
        const u = TD.Screen.unit, t2 = s.weaponTier > 0;
        const n = (t2 ? 11 : 7) + s.stats.projAdd * 2;     // PRO: denser cloud, longer reach
        fan(game, s, n, s.angle, this.spread + s.stats.spread, 0, (a, px, py, sp, crit) => {
          const speed = (520 + M.rand(-90, 120)) * s.stats.projSpeed * u;
          return P({ x: px, y: py, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
              r: 3.6 * u, dmg: dmgOf(s, 6, crit), life: t2 ? 0.55 : 0.42, maxLife: t2 ? 0.55 : 0.42,
              pierce: s.stats.pierce + (t2 ? 1 : 0), hits: new Set(), color: t2 ? "#ffe27a" : "#ffd14d", glow: 9,
              crit, homing: s.stats.homing, splash: s.stats.splash });
        });
      },
    },
    /* Laser Pointer — pulse, fast & piercing */
    pulse: {
      name: "Laser Pointer™", icon: "🔦", rate: 7.5, spread: 0.03,
      fire(game, s) {
        const u = TD.Screen.unit, t2 = s.weaponTier > 0;
        const n = (t2 ? 2 : 1) + s.stats.projAdd;          // PRO: twin parallel beams, deeper pierce
        const speed = 980 * s.stats.projSpeed * u;
        fan(game, s, n, s.angle, n > 1 ? projSpread(s, 0.16) : 0, speed, (a, px, py, sp, crit) =>
          P({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a,
              r: 3 * u, dmg: dmgOf(s, 6, crit), life: 1.0, maxLife: 1.0,
              pierce: (t2 ? 2 : 1) + s.stats.pierce, hits: new Set(), color: t2 ? "#ff8af0" : "#ff5edb", glow: t2 ? 16 : 14,
              kind: "beam", crit, homing: s.stats.homing, splash: s.stats.splash }));
      },
    },
    /* Knock-off Railgun — charged piercing slug */
    rail: {
      name: "Knock-off Railgun", icon: "🛰️", rate: 0.95, spread: 0,
      fire(game, s) {
        const u = TD.Screen.unit;
        const n = 1 + s.stats.projAdd;                 // respect Buy-One-Get-One etc.
        const t2 = s.weaponTier > 0;                       // PRO: heavier slug, deeper pierce
        const speed = 1350 * s.stats.projSpeed * u;
        const spread = n > 1 ? projSpread(s, 0.12) : 0;
        const muzzle = (s.r + 6) * u;
        const px = s.x + Math.cos(s.angle) * muzzle, py = s.y + Math.sin(s.angle) * muzzle;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          const a = s.angle + (t - 0.5) * spread;
          const crit = M.chance(s.stats.critChance);
          game.projectiles.push(P({ x: px, y: py, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, angle: a,
            r: (t2 ? 8.5 : 7) * u, dmg: dmgOf(s, t2 ? 82 : 58, crit), life: 1.4, maxLife: 1.4,
            pierce: (t2 ? 7 : 4) + s.stats.pierce, hits: new Set(), color: t2 ? "#b18cff" : "#9d6bff", glow: t2 ? 26 : 22,
            kind: "slug", crit, homing: s.stats.homing, turnRate: 3, splash: s.stats.splash }));
        }
        game.flashMuzzle(px, py, s.angle, "#9d6bff", 1.8 + n * 0.2);
        game.shake(4);
        // recoil
        s.vx -= Math.cos(s.angle) * 60; s.vy -= Math.sin(s.angle) * 60;
      },
    },
    /* Homing Air-Pods — missiles */
    missiles: {
      name: "Homing Air-Pods", icon: "🎧", rate: 2.0, spread: 0.5,
      fire(game, s) {
        const u = TD.Screen.unit, t2 = s.weaponTier > 0;
        const n = 1 + Math.floor(s.stats.projAdd) + (t2 ? 1 : 0);   // PRO: +1 missile, tighter tracking, bigger blast
        for (let i = 0; i < n; i++) {
          const a = s.angle + (n > 1 ? (i / (n - 1) - 0.5) * 0.8 : 0) + M.rand(-0.1, 0.1);
          const muzzle = (s.r + 4) * u;
          const px = s.x + Math.cos(a) * muzzle, py = s.y + Math.sin(a) * muzzle;
          const crit = M.chance(s.stats.critChance);
          game.projectiles.push(P({ x: px, y: py, vx: Math.cos(a) * 220 * u, vy: Math.sin(a) * 220 * u, angle: a,
            r: 5 * u, dmg: dmgOf(s, t2 ? 20 : 16, crit), life: 8, maxLife: 8,   // guided: hunt for up to 8s
            pierce: s.stats.pierce, hits: new Set(), color: t2 ? "#ffa85e" : "#ff8a3b", glow: t2 ? 16 : 14,
            kind: "missile", homing: 1, turnRate: t2 ? 7.5 : 5.5, accel: 720 * u, maxSpeed: 560 * u,
            crit, splash: Math.max(s.stats.splash, (t2 ? 40 : 26) * u) }));
        }
      },
    },
    /* Boomerang Spatula — blades that return */
    blades: {
      name: "Boomerang Spatula", icon: "🪃", rate: 1.5, spread: 0.6,
      fire(game, s) {
        const u = TD.Screen.unit, t2 = s.weaponTier > 0;
        const n = (t2 ? 3 : 2) + s.stats.projAdd;          // PRO: +1 bigger, faster-spinning blade
        for (let i = 0; i < n; i++) {
          const a = s.angle + (n > 1 ? (i / (n - 1) - 0.5) * this.spread : 0);
          const speed = 560 * s.stats.projSpeed * u;
          const crit = M.chance(s.stats.critChance);
          game.projectiles.push(P({ x: s.x, y: s.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            r: (t2 ? 8.5 : 7) * u, dmg: dmgOf(s, t2 ? 13 : 11, crit), life: 1.5, maxLife: 1.5,
            pierce: 99, hits: new Set(), color: t2 ? "#7affd9" : "#52ffce", glow: t2 ? 16 : 14, kind: "blade",
            spin: M.rand(t2 ? 13 : 10, t2 ? 19 : 16), ret: true, owner: s, crit, splash: s.stats.splash }));
        }
      },
    },
    /* Static-Sock Zapper — chain lightning (hitscan) */
    arc: {
      name: "Static-Sock Zapper", icon: "🧦", rate: 2.4, spread: 0,
      fire(game, s) {
        const u = TD.Screen.unit, t2 = s.weaponTier > 0;
        const range = (t2 ? 280 : 230) * u, chainRange = (t2 ? 210 : 170) * u;
        const bolts = 1 + Math.floor(s.stats.projAdd) + (t2 ? 1 : 0);   // PRO: +1 bolt, longer chains & reach
        const chainLen = 3 + s.stats.pierce + (t2 ? 2 : 0);
        const firstUsed = new Set();                     // spread bolts to different targets
        let any = false;
        for (let b = 0; b < bolts; b++) {
          const own = new Set();
          let from = { x: s.x, y: s.y };
          let linked = false;
          for (let i = 0; i < chainLen; i++) {
            let tgt;
            if (i === 0) {
              tgt = nearestEnemy(game, from.x, from.y, range, firstUsed);
              if (!tgt) tgt = nearestEnemy(game, from.x, from.y, range, own); // crowd smaller than bolts: reuse
              if (tgt) firstUsed.add(tgt);
            } else {
              tgt = nearestEnemy(game, from.x, from.y, chainRange, own);
            }
            if (!tgt) break;
            any = true; linked = true;
            own.add(tgt);
            const crit = M.chance(s.stats.critChance);
            const d = dmgOf(s, 9, crit) * (1 - i * 0.12);
            game.damageEnemy(tgt, d, crit, { x: tgt.x, y: tgt.y });
            game.addLightning(from.x, from.y, tgt.x, tgt.y);
            from = { x: tgt.x, y: tgt.y };
          }
          if (!linked) break; // no targets left at all
        }
        if (any) game.flashMuzzle(s.x, s.y, s.angle, "#7ef9ff", 0.8 + bolts * 0.1);
      },
    },
  };

  TD.WEAPONS = WEAPONS;
  TD.weaponNearest = nearestEnemy;
})();
