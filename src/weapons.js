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

  /* ============== WEAPON CATALOG ============== */
  const WEAPONS = {
    /* default — Pea Shooter */
    blaster: {
      name: "Pea-Shooter Mk0", icon: "🔫", rate: 3.4, spread: 0.10,
      fire(game, s) {
        const u = TD.Screen.unit;
        const n = 1 + s.stats.projAdd;
        const spread = this.spread + s.stats.projAdd * 0.06 + s.stats.spread;
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
        const u = TD.Screen.unit;
        const n = 3 + s.stats.projAdd;
        const speed = 600 * s.stats.projSpeed * u;
        fan(game, s, n, s.angle, this.spread + s.stats.spread, speed, (a, px, py, sp, crit) =>
          P({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              r: 4.2 * u, dmg: dmgOf(s, 8, crit), life: 1.0, maxLife: 1.0,
              pierce: s.stats.pierce, hits: new Set(), color: "#b6ff6a", glow: 11,
              crit, homing: s.stats.homing, splash: s.stats.splash }));
      },
    },
    /* Bargain Buckshot — flak */
    flak: {
      name: "Bargain Buckshot", icon: "💥", rate: 1.7, spread: 0.95,
      fire(game, s) {
        const u = TD.Screen.unit;
        const n = 7 + s.stats.projAdd * 2;
        fan(game, s, n, s.angle, this.spread + s.stats.spread, 0, (a, px, py, sp, crit) => {
          const speed = (520 + M.rand(-90, 120)) * s.stats.projSpeed * u;
          return P({ x: px, y: py, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
              r: 3.6 * u, dmg: dmgOf(s, 6, crit), life: 0.42, maxLife: 0.42,
              pierce: s.stats.pierce, hits: new Set(), color: "#ffd14d", glow: 9,
              crit, splash: s.stats.splash });
        });
      },
    },
    /* Laser Pointer — pulse, fast & piercing */
    pulse: {
      name: "Laser Pointer™", icon: "🔦", rate: 7.5, spread: 0.03,
      fire(game, s) {
        const u = TD.Screen.unit;
        const n = 1 + s.stats.projAdd;
        const speed = 980 * s.stats.projSpeed * u;
        fan(game, s, n, s.angle, n > 1 ? 0.16 : 0, speed, (a, px, py, sp, crit) =>
          P({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a,
              r: 3 * u, dmg: dmgOf(s, 6, crit), life: 1.0, maxLife: 1.0,
              pierce: 1 + s.stats.pierce, hits: new Set(), color: "#ff5edb", glow: 14,
              kind: "beam", crit, splash: s.stats.splash }));
      },
    },
    /* Knock-off Railgun — charged piercing slug */
    rail: {
      name: "Knock-off Railgun", icon: "🛰️", rate: 0.95, spread: 0,
      fire(game, s) {
        const u = TD.Screen.unit;
        const n = 1 + s.stats.projAdd;                 // respect Buy-One-Get-One etc.
        const speed = 1350 * s.stats.projSpeed * u;
        const spread = n > 1 ? 0.12 + s.stats.spread : 0;
        const muzzle = (s.r + 6) * u;
        const px = s.x + Math.cos(s.angle) * muzzle, py = s.y + Math.sin(s.angle) * muzzle;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          const a = s.angle + (t - 0.5) * spread;
          const crit = M.chance(s.stats.critChance);
          game.projectiles.push(P({ x: px, y: py, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, angle: a,
            r: 7 * u, dmg: dmgOf(s, 58, crit), life: 1.4, maxLife: 1.4,
            pierce: 4 + s.stats.pierce, hits: new Set(), color: "#9d6bff", glow: 22,
            kind: "slug", crit, splash: s.stats.splash }));
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
        const u = TD.Screen.unit;
        const n = 1 + Math.floor(s.stats.projAdd);
        for (let i = 0; i < n; i++) {
          const a = s.angle + (n > 1 ? (i / (n - 1) - 0.5) * 0.8 : 0) + M.rand(-0.1, 0.1);
          const muzzle = (s.r + 4) * u;
          const px = s.x + Math.cos(a) * muzzle, py = s.y + Math.sin(a) * muzzle;
          const crit = M.chance(s.stats.critChance);
          game.projectiles.push(P({ x: px, y: py, vx: Math.cos(a) * 220 * u, vy: Math.sin(a) * 220 * u, angle: a,
            r: 5 * u, dmg: dmgOf(s, 16, crit), life: 2.6, maxLife: 2.6,
            pierce: s.stats.pierce, hits: new Set(), color: "#ff8a3b", glow: 14,
            kind: "missile", homing: 1, turnRate: 5.5, accel: 720 * u, maxSpeed: 560 * u,
            crit, splash: Math.max(s.stats.splash, 26 * u) }));
        }
      },
    },
    /* Boomerang Spatula — blades that return */
    blades: {
      name: "Boomerang Spatula", icon: "🪃", rate: 1.5, spread: 0.6,
      fire(game, s) {
        const u = TD.Screen.unit;
        const n = 2 + s.stats.projAdd;
        for (let i = 0; i < n; i++) {
          const a = s.angle + (n > 1 ? (i / (n - 1) - 0.5) * this.spread : 0);
          const speed = 560 * s.stats.projSpeed * u;
          const crit = M.chance(s.stats.critChance);
          game.projectiles.push(P({ x: s.x, y: s.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            r: 7 * u, dmg: dmgOf(s, 11, crit), life: 1.5, maxLife: 1.5,
            pierce: 99, hits: new Set(), color: "#52ffce", glow: 14, kind: "blade",
            spin: M.rand(10, 16), ret: true, owner: s, crit, splash: s.stats.splash }));
        }
      },
    },
    /* Static-Sock Zapper — chain lightning (hitscan) */
    arc: {
      name: "Static-Sock Zapper", icon: "🧦", rate: 2.4, spread: 0,
      fire(game, s) {
        const u = TD.Screen.unit;
        const range = 230 * u, chainRange = 170 * u;
        const bolts = 1 + Math.floor(s.stats.projAdd);   // multishot = more separate bolts
        const chainLen = 3 + s.stats.pierce;             // pierce = longer chains
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
