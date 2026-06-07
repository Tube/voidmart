/* ============================================================
   VOIDMART — game.js
   Core: ship, simulation, collisions, particles, rendering.
   Singleton TD.Game. UI lives in ui.js; content in the catalogs.
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;
  const M = TD.math;
  const S = TD.Screen;

  function makeStats() {
    return {
      weapon: "blaster",
      damage: 1, fireRate: 1, projSpeed: 1, projAdd: 0, spread: 0, pierce: 0,
      critChance: 0.05, critMult: 2,
      moveSpeed: 1, thrust: 1, turn: 1,
      maxHull: 0, hullRegen: 0,
      maxShield: 40, shieldRegen: 8, shieldDelay: 2.2,
      pickup: 1, xp: 1, coinDrop: 1,
      bodyDmg: 0, ramArmor: 0, lifesteal: 0,
      homing: 0, splash: 0, splashDmg: 0.4,
      reflect: false, thorns: 0, dodge: 0, blink: false,
    };
  }

  const Game = {
    state: "menu",
    /* ---------- lifecycle ---------- */
    init() {
      this.canvas = document.getElementById("game");
      S.init(this.canvas);
      this.ctx = S.ctx;
      TD.Input.attach(this.canvas);
      S.onResize = () => { this.makeStars(); if (this.ship) this.ship.r = 13 * S.unit; };
      this.makeStars();
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    },

    reset() {
      this.ship = {
        x: S.W / 2, y: S.H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, r: 13 * S.unit,
        baseHull: 100, hull: 100,
        shield: 40, hitTimer: 99, invuln: 1.2, fireCD: 0,
        stats: makeStats(), mods: {}, drones: [], game: this,
        flame: 0, addDrone: function () {
          const i = this.drones.length;
          this.drones.push({ ang: (i / 6) * M.TAU, dist: 34, fireCD: M.rand(0, 0.4), spin: 1.6 });
        },
      };
      this.ship.hull = this.ship.baseHull + this.ship.stats.maxHull;
      this.ship.shield = this.ship.stats.maxShield;

      this.projectiles = []; this.enemies = []; this.enemyShots = [];
      this.coins = []; this.particles = []; this.lightnings = []; this.pickups = [];
      this.level = 1; this.xp = 0; this.xpNeed = this.needFor(1);
      this.score = 0; this.coinTotal = 0; this.kills = 0;
      this.time = 0; this.day = 1; this.dayTimer = 28;
      this.bossActive = false; this.bossRef = null; this.pendingBoss = false; this.bossesBeaten = 0;
      this.miniRef = null; this.pendingMini = false; this._lastMini = null; this._lastBoss = null;
      this.shakeAmt = 0; this.hudT = 0; this.flashTimer = 9;
      // juice / game-feel state
      this.hitStop = 0; this.flashA = 0; this.flashColor = "#ffffff";
      this.vignetteA = 0; this.kickX = 0; this.kickY = 0;
      this.pops = []; this.floaters = []; this.zones = [];
      // prize-wheel meta-powers
      this.ship.prizes = {};
      this.ship.chassis = TD.BODIES.DEFAULT;   // default hull until the welcome wheel resolves (paid) or stays (free)
      this.ship.damageMul = 1; this.ship.fireMul = 1;
      this.ship.combo = 0; this.ship.shotCount = 0; this.ship.shockT = 4;
      this.ship.trailT = 0;
      TD.Director.reset(this);
    },

    /* ---------- PRIZE WHEEL ---------- */
    prizeLvl(id) { return (this.ship && this.ship.prizes && this.ship.prizes[id]) || 0; },
    openPrizeWheel(reason) {
      this.state = "wheel";
      TD.Input.enabled = false; TD.Input.reset();
      if (TD.Audio) TD.Audio.setThrust(0);
      this._wheelReason = reason;
      if (reason === "start") {
        // The welcome ship wheel is a paid perk. Free players skip the random
        // ship pick and launch straight into play in the default hull.
        if (!(TD.Entitlement && TD.Entitlement.isUnlocked())) {
          this.applyBody(TD.BODIES.DEFAULT);
          return;
        }
        // welcome spin: choose a ship CHASSIS, not a power
        TD.UI.openWheel(this, TD.BODIES.roll(3), "🚀 WELCOME GIFT · PICK YOUR RIDE", {
          title: "🎡 Spin for your <b>Ship</b>!",
          sub: "Every chassis flies differently. Spin to claim one.",
        });
        return;
      }
      TD.UI.openWheel(this, TD.PRIZES.roll(3), "🏆 BOSS REWARD · MEMBERS-ONLY", {
        title: "🎡 Spin the <b>Prize Wheel</b>!",
        sub: "One <b>FREE</b> power, guaranteed. These <b>stack forever</b>.",
      });
    },
    applyBody(body) {
      const s = this.ship;
      s.chassis = body;
      if (body.apply) body.apply(s.stats);
      // refill hull & field to the (possibly changed) maxima
      s.hull = s.baseHull + s.stats.maxHull;
      s.shield = s.stats.maxShield;
      this.toast("🚀 " + body.name + " equipped!", "good");
      this.ring(s.x, s.y, s.r * 4, body.color || "#ffd23b");
      this.state = "play";
      TD.Input.enabled = true;
      TD.UI.enterPlay();
    },
    awardPrize(prize) {
      if (prize.isBody) { this.applyBody(prize); return; }
      const n = (this.ship.prizes[prize.id] = (this.ship.prizes[prize.id] || 0) + 1);
      if (prize.id === "blackstar") this.ship.shield = Math.min(this.fieldCap(), Math.max(this.ship.shield, this.ship.stats.maxShield + n * 25));
      this.toast("🎡 " + prize.name + " ×" + n, "good");
      this.ring(this.ship.x, this.ship.y, this.ship.r * 4, "#ffd23b");
      // resume
      this.state = "play";
      TD.Input.enabled = true;
      TD.UI.enterPlay();
      if (this._wheelReason !== "start" && this.pendingBoss && !this.bossActive) {
        this.pendingBoss = false; this.spawnBoss();
      }
    },
    // recompute live damage/fire multipliers + timed prize effects
    updatePrizes(dt) {
      const s = this.ship;
      let dm = 1, fm = 1;
      const cc = this.prizeLvl("coincannon");
      if (cc) dm += Math.min(this.coinTotal * 0.0016 * cc, 0.7 * cc);
      const cr = this.prizeLvl("crowd");
      if (cr) {
        const R = 280 * S.unit; let near = 0;
        for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - s.x, e.y - s.y) < R) near++;
        dm += Math.min(near * 0.05 * cr, 0.6 * cr);
      }
      const ly = this.prizeLvl("loyalty");
      if (ly) {
        const cap = 25 + 15 * ly;
        const c = Math.min(s.combo, cap);
        dm += c * 0.012 * ly;
        fm += c * 0.007 * ly;
      }
      s.damageMul = dm; s.fireMul = fm;
      // Doorbuster Shockwave (timed)
      const sw = this.prizeLvl("shockwave");
      if (sw) {
        s.shockT -= dt;
        if (s.shockT <= 0) { s.shockT = Math.max(2.4, 6 - sw * 0.6); this.doShockwave(sw); }
      }
    },
    onShotFired() {
      const s = this.ship, ov = this.prizeLvl("overstock");
      if (!ov) return;
      s.shotCount++;
      const every = Math.max(3, 7 - ov);
      if (s.shotCount % every === 0) this.spawnBulk(ov);
    },
    spawnBulk(L) {
      const s = this.ship, u = S.unit, a = s.angle;
      const px = s.x + Math.cos(a) * (s.r + 8) * u, py = s.y + Math.sin(a) * (s.r + 8) * u;
      this.projectiles.push({ x: px, y: py, vx: Math.cos(a) * 360 * u, vy: Math.sin(a) * 360 * u,
        r: (12 + L * 2) * u, dmg: (55 + 22 * L) * s.stats.damage * (s.damageMul || 1), life: 2.2, maxLife: 2.2,
        pierce: 99, hits: new Set(), color: "#ffb04d", glow: 22, kind: "bulk", angle: a,
        homing: 0, splash: 36 * u, crit: false });
      this.flashMuzzle(px, py, a, "#ffb04d", 2);
      this.shake(3);
    },
    doShockwave(L) {
      const s = this.ship, R = 150 * S.unit * (1 + 0.28 * L), dmg = (26 + 12 * L) * s.stats.damage;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) || 1;
        if (d < R + e.r) {
          this.damageEnemy(e, dmg, false, e);
          e.vx += dx / d * 320; e.vy += dy / d * 320;
        }
      }
      this.ring(s.x, s.y, R, "#c79bff"); this.ring(s.x, s.y, R * 0.6, "#e3c9ff");
      this.shake(5);
      if (TD.Audio) TD.Audio.shieldBreak();
    },
    burnTrail(L, dt) {
      const s = this.ship;
      if (this.particles.length < 170 && Math.random() < 0.5) this.particles.push({ x: s.x - Math.cos(s.angle) * s.r, y: s.y - Math.sin(s.angle) * s.r,
        vx: -s.vx * 0.1, vy: -s.vy * 0.1, life: 0.3, maxLife: 0.3, r: M.rand(2, 4) * S.unit,
        color: "#5b8cff", kind: "spark" });
      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = 0.09;
        const R = s.r * 2.2, dmg = (14 + 6 * L);
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - s.x, e.y - s.y) < R + e.r) this.damageEnemy(e, dmg, false, e);
        }
      }
    },
    launchImpulseMissile(L) {
      const s = this.ship, u = S.unit, n = 1 + Math.floor(L / 2);
      for (let i = 0; i < n; i++) {
        const a = M.rand(0, M.TAU);
        this.projectiles.push({ x: s.x, y: s.y, vx: Math.cos(a) * 200 * u, vy: Math.sin(a) * 200 * u, angle: a,
          r: 5 * u, dmg: (18 + 6 * L) * s.stats.damage * (s.damageMul || 1), life: 2.6, maxLife: 2.6,
          pierce: 0, hits: new Set(), color: "#ff7ad1", glow: 14, kind: "missile",
          homing: 1, turnRate: 6, accel: 720 * u, maxSpeed: 560 * u, splash: 24 * u, crit: false });
      }
      this.flashMuzzle(s.x, s.y, s.angle, "#ff7ad1", 1);
    },
    retaliate(L) {
      const s = this.ship, n = 6 + 3 * L;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * M.TAU + M.rand(-0.1, 0.1);
        this.projectiles.push({ x: s.x, y: s.y, vx: Math.cos(a) * 560 * S.unit, vy: Math.sin(a) * 560 * S.unit,
          r: 4.5 * S.unit, dmg: (12 + 4 * L) * s.stats.damage, life: 1.0, maxLife: 1.0,
          pierce: 1, hits: new Set(), color: "#7af1ff", glow: 12, kind: "bolt", homing: 0, splash: 0, crit: false });
      }
      this.ring(s.x, s.y, s.r * 3, "#7af1ff");
    },

    start() {
      this.reset();
      this.openPrizeWheel("start");
    },

    /* ---------- helpers exposed to catalogs ---------- */
    difficulty() { return 1 + this.level * 0.08 + this.time / 160; },
    needFor(lvl) { return Math.round(8 + lvl * 5 + lvl * lvl * 1.15); },

    edgePoint() {
      const W = S.W, H = S.H, m = 6;
      switch (M.randInt(0, 3)) {
        case 0: return { x: M.rand(0, W), y: m };
        case 1: return { x: M.rand(0, W), y: H - m };
        case 2: return { x: m, y: M.rand(0, H) };
        default: return { x: W - m, y: M.rand(0, H) };
      }
    },
    spawnAtEdge(type, opts) {
      const p = this.edgePoint();
      return this.spawnEnemy(type, p.x, p.y, opts || {});
    },
    spawnEnemy(type, x, y, opts) {
      opts = opts || {};
      const def = TD.ENEMIES[type];
      const e = { type, def, x, y, vx: 0, vy: 0, ang: 0, dead: false, flashHit: 0, contactCD: 0,
        hpMul: 1, tier: opts.tier, born: 0, hitScale: 1 };
      def.spawn(e);
      const scale = opts.hpScale || this.difficulty();
      e.hpScale = scale;
      e.maxHp = def.baseHp * scale * e.hpMul * (def.isBoss ? 1 : 1);
      e.hp = e.maxHp;
      e.contact = def.contact * (1 + (scale - 1) * 0.35) * 0.8;
      this.enemies.push(e);
      return e;
    },
    spawnBoss() {
      this.bossActive = true;
      TD.Audio.bossSpawn();
      this.screenFlash("#ff2d4f", 0.5);
      this.hitstop(0.08);
      // pick a boss at random from the roster (avoid immediate repeat)
      const roster = TD.BOSSES || ["boss"];
      let type = M.pick(roster);
      if (roster.length > 1 && type === this._lastBoss) type = M.pick(roster);
      this._lastBoss = type;
      // serpent/rammer prefer to start near centre-ish so they don't clip the wall
      const p = this.edgePoint();
      const b = this.spawnEnemy(type, p.x, p.y, { hpScale: this.difficulty() * (1.1 + this.bossesBeaten * 0.5) });
      this.bossRef = b;
      const banner = b.def.banner || ["⭐ BOSS", "Wants your hull."];
      TD.UI.bossBanner(banner[0], banner[1]);
      this.shake(8);
    },
    // Miniboss wave (every 5 levels, off-boss): random pick, NO prize wheel,
    // pays out a massive coin pile. Does not set bossActive (mobs keep spawning).
    spawnMiniboss() {
      const roster = TD.MINIBOSSES || [];
      if (!roster.length) return;
      let type = M.pick(roster);
      if (roster.length > 1 && type === this._lastMini) type = M.pick(roster);
      this._lastMini = type;
      const p = this.edgePoint();
      const m = this.spawnEnemy(type, p.x, p.y, { hpScale: this.difficulty() * 1.35 });
      this.miniRef = m;
      TD.Audio.bossSpawn();
      this.screenFlash("#ffd23b", 0.3);
      this.shake(6);
      const banner = m.def.banner || ["⚠ MINIBOSS", "A limited-time threat."];
      TD.UI.bossBanner(banner[0], banner[1]);
    },

    // segment-aware overlap test: main body circle OR any e.parts circle
    hitEnemy(e, x, y, rad) {
      const rr = rad + e.r;
      if ((x - e.x) * (x - e.x) + (y - e.y) * (y - e.y) < rr * rr) return true;
      if (e.parts) {
        for (const pt of e.parts) {
          const r2 = rad + pt.r;
          if ((x - pt.x) * (x - pt.x) + (y - pt.y) * (y - pt.y) < r2 * r2) return true;
        }
      }
      return false;
    },

    /* ---------- combat helpers ---------- */
    damageEnemy(e, dmg, crit, at) {
      if (e.dead) return;
      e.hp -= dmg; e.flashHit = 0.09;
      e.hitScale = Math.min(1.45, (e.hitScale || 1) + 0.32);
      if (crit) TD.Audio.crit(); else TD.Audio.hit();
      if (crit && e.hp > 0) {
        const now = performance.now();
        if (now - (this._critT || 0) > 70) {
          this._critT = now;
          this.addFloater(at ? at.x : e.x, (at ? at.y : e.y) - e.r, Math.round(dmg) + "!", "#fff3a0", { size: 17 });
        }
      }
      if (this.ship.stats.lifesteal > 0) this.healHull(dmg * this.ship.stats.lifesteal);
      this.spark(at ? at.x : e.x, at ? at.y : e.y, crit ? "#fff" : "#ffd98a", crit ? 5 : 2, crit ? 1.5 : 1);
      if (e.hp <= 0) this.killEnemy(e);
    },
    explodeAt(x, y, radius, dmg, exclude) {
      if (radius <= 0) return;
      for (const e of this.enemies) {
        if (e.dead || e === exclude) continue;
        if (Math.hypot(e.x - x, e.y - y) < radius + e.r) this.damageEnemy(e, dmg, false, e);
      }
      this.ring(x, y, radius, "#ff9d3b");
    },
    killEnemy(e) {
      if (e.dead) return;
      e.dead = true; this.kills++;
      this.score += Math.round(e.def.score * (1 + this.level * 0.04));
      this.explode(e.x, e.y, e.def.color, e.r);
      if (!e.def.isBoss) TD.Audio.explosion(e.r);
      this.addPop(e.x, e.y, e.r * 3.4, e.def.color, { fill: "#ffffff", w: 4 });
      this.shake(e.def.isBoss ? 14 : Math.min(3 + e.r * 0.13, 9));
      if (!e.def.isBoss) {
        const hs = e.r > 19 * S.unit ? 0.05 : e.r > 13 * S.unit ? 0.025 : 0;
        if (hs) this.hitstop(hs);
      }
      if (e.def.die) e.def.die(e, this);
      // coin drop (big/small mix via dropCoins)
      let total = Math.round(e.def.coins * (1 + this.level * 0.05) * (this.ship.stats.coinDrop || 1));
      if (e.def.isMini) total = Math.round(total * 1.6);
      this.dropCoins(e.x, e.y, total, e.def.isMini ? 210 : 150);
      // rare free-sample heal drop
      if (!e.def.isBoss && !e.def.isMini && M.chance(0.05)) this.dropPickup(e.x, e.y);
      // miniboss clear: fanfare + heal + massive coins, but NO prize wheel
      if (e.def.isMini) {
        this.dropPickup(e.x, e.y);
        this.screenFlash("#ffd23b", 0.4); this.hitstop(0.08); this.shake(12);
        this.addPop(e.x, e.y, e.r * 4, "#ffe27a", { fill: "#ffffff", w: 5, life: 0.5 });
        this.addFloater(e.x, e.y - e.r, "MINIBOSS DOWN!", "#ffe27a", { size: 22, vy: -28, life: 1.0 });
        if (this.miniRef === e) this.miniRef = null;
        TD.Audio.bossDie();
      }
      // prize: Loyalty Streak combo + Clearance Chain-Reaction
      this.ship.combo++;
      const ch = this.prizeLvl("chain");
      if (ch && !e.def.isBoss && M.chance(Math.min(0.18 * ch, 0.7))) {
        const R = 92 * S.unit * (1 + 0.2 * ch);
        this.explodeAt(e.x, e.y, R, (24 + 10 * ch) * this.ship.stats.damage, e);
        this.ring(e.x, e.y, R, "#ff6a13");
        this.dropCoins(e.x, e.y, 2);
      }
      if (e.def.isBoss) this.onBossDead(e);
    },
    onBossDead(e) {
      this.bossActive = false; this.bossRef = null; this.bossesBeaten++;
      TD.Audio.bossDie();
      this.screenFlash("#fff7d6", 0.72);
      this.hitstop(0.12);
      this.shake(18);
      this.addPop(e.x, e.y, e.r * 4, "#fff3c4", { fill: "#ffffff", w: 6, life: 0.5 });
      this.addPop(e.x, e.y, e.r * 6, "#ffd23b", { w: 4, life: 0.55 });
      this.addFloater(e.x, e.y - e.r, "5★ KILL!", "#ffe27a", { size: 30, vy: -30, life: 1.0 });
      this.score += 2500;
      this.restoreField();
      this.dropCoins(e.x, e.y, 160, 240);
      this.dropPickup(e.x, e.y);
      this.toast("⭐ 5-star kill! +2500 savings", "good");
      this.openPrizeWheel("boss");
    },
    dropPickup(x, y) {
      this.pickups.push({ x, y, r: 11 * S.unit, life: 12, t: 0, kind: "heal" });
    },
    // spawn `total` coin-value as a mix of big (×10) and small (×1) coins
    dropCoins(x, y, total, spread) {
      total = Math.max(0, Math.round(total));
      if (!total) return;
      const u = S.unit, sps = spread || 150;
      const push = (val, big) => {
        const a = M.rand(0, M.TAU), sp = M.rand(40, sps) * u;
        this.coins.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          r: (big ? 9 : 5) * u, value: val, big: !!big, life: big ? 20 : 13, t: M.rand(0, 6) });
      };
      let bigs = Math.floor(total / 10);
      if (bigs > 30) bigs = 30;            // cap entity count on huge payouts
      for (let i = 0; i < bigs; i++) push(10, true);
      const rem = total - bigs * 10;
      if (rem > 0) {                        // remainder as a few small coins
        const n = Math.min(rem, 5), per = Math.max(1, Math.round(rem / n));
        let left = rem;
        for (let i = 0; i < n && left > 0; i++) { const v = Math.min(per, left); push(v, false); left -= v; }
      }
    },
    healHull(amt) {
      const max = this.ship.baseHull + this.ship.stats.maxHull;
      this.ship.hull = Math.min(max, this.ship.hull + amt);
    },
    // hard ceiling the field can ever reach (normal max + 1000 of overcharge)
    fieldCap() { return this.ship.stats.maxShield + 1000; },
    // top the field UP to at least max without ever reducing an overcharged field
    restoreField() {
      const s = this.ship;
      s.shield = Math.min(this.fieldCap(), Math.max(s.shield, s.stats.maxShield));
    },

    damageShip(dmg, srcAng) {
      const s = this.ship;
      if (s.invuln > 0 || this.state !== "play") return;
      if (s.stats.dodge > 0 && M.chance(s.stats.dodge)) { s.dodgeFlash = 0.5; return; }
      s.hitTimer = 0;
      s.combo = 0; // Loyalty Streak resets when struck
      const rt = this.prizeLvl("retaliate");
      if (rt) this.retaliate(rt);
      let remain = dmg;
      if (s.shield > 0) {
        const ab = Math.min(s.shield, remain);
        s.shield -= ab; remain -= ab;
        this.spark(s.x, s.y, "#7af1ff", 4, 1.2);
        TD.Audio.shieldHit();
        this.screenFlash("#5bf0ff", 0.18);
        this.addPop(s.x, s.y, s.r * 3, "#7af1ff", { w: 3, life: 0.26 });
        this.hitstop(0.025);
        if (s.shield <= 0) this.onShieldBreak();
      }
      if (remain > 0) {
        s.hull -= remain;
        s.invuln = Math.max(s.invuln, 0.45);
        this.shake(11); this.spark(s.x, s.y, "#ff6a6a", 8, 1.5);
        this.screenFlash("#ff2d40", 0.4);
        this.vignettePulse(0.6);
        this.hitstop(0.07);
        this.kick(15, M.rand(0, M.TAU));
        this.addPop(s.x, s.y, s.r * 4, "#ff5a6a", { fill: "#ffd0d0", w: 4 });
        this.addFloater(s.x, s.y - s.r, "-" + Math.round(remain), "#ff8080", { size: 18 });
        TD.Audio.playerHit();
        if (s.hull <= 0) { s.hull = 0; this.gameOver(); }
      }
    },
    onShieldBreak() {
      const s = this.ship;
      TD.Audio.shieldBreak();
      this.screenFlash("#7af1ff", 0.4);
      this.hitstop(0.05);
      this.addPop(s.x, s.y, s.r * 5.5, "#7af1ff", { w: 4 });
      this.ring(s.x, s.y, s.r * 4, "#7af1ff");
      this.shake(8);
      if (s.stats.blink) {
        // teleport to the safest open spot
        let best = null, bd = -1;
        for (let i = 0; i < 10; i++) {
          const x = M.rand(S.W * 0.1, S.W * 0.9), y = M.rand(S.H * 0.1, S.H * 0.9);
          let nd = Infinity;
          for (const e of this.enemies) nd = Math.min(nd, Math.hypot(e.x - x, e.y - y));
          if (nd > bd) { bd = nd; best = { x, y }; }
        }
        if (best) { s.x = best.x; s.y = best.y; s.vx = s.vy = 0; }
        s.invuln = 1.4;
        this.ring(s.x, s.y, s.r * 5, "#c79bff");
        this.toast("🌀 Warped away!", "good");
      }
      if (s.stats.thorns > 0) this.explodeAt(s.x, s.y, s.r * 4, s.stats.thorns * 2, null);
    },

    gameOver() {
      this.state = "over";
      TD.Input.enabled = false;
      TD.Audio.setThrust(0);
      TD.Audio.gameOver();
      this.explode(this.ship.x, this.ship.y, "#ff8a3b", this.ship.r * 2.2);
      this.addPop(this.ship.x, this.ship.y, this.ship.r * 7, "#ff8a3b", { fill: "#ffffff", w: 6, life: 0.6 });
      this.screenFlash("#ffffff", 0.6);
      this.hitstop(0.12);
      this.shake(20);
      TD.UI.gameOver(this);
    },

    /* ---------- coin / xp ---------- */
    collectCoin(c) {
      this.coinTotal += c.value;
      this.xp += c.value * this.ship.stats.xp;
      this.spark(c.x, c.y, "#ffd23b", 3, 0.9);
      TD.Audio.coin();
      this.ship.coinPop = Math.min(8, (this.ship.coinPop || 0) + 1);
      if (c.big) {
        this.addFloater(c.x, c.y, "+" + c.value, "#ffe27a", { size: 15, life: 0.6 });
        this.addPop(c.x, c.y, c.r * 2.6, "#ffd23b", { w: 2, life: 0.24 });
      }
      const im = this.prizeLvl("impulse");
      if (im && M.chance(Math.min(0.12 * im, 0.6))) this.launchImpulseMissile(im);
      while (this.xp >= this.xpNeed) this.levelUp();
    },
    levelUp() {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = this.needFor(this.level);
      if (this.level % 10 === 0) this.pendingBoss = true;
      else if (this.level % 5 === 0) this.pendingMini = true;
      this.openShop();
    },
    openShop() {
      this.state = "shop";
      TD.Input.enabled = false; TD.Input.reset();
      TD.Audio.setThrust(0);
      TD.Audio.levelUp();
      this.rerolls = 2;
      this.flashTimer = 9;
      TD.UI.openShop(this, TD.Upgrades.roll(this.ship, 3));
    },
    chooseUpgrade(u) {
      this.ship.mods[u.id] = (this.ship.mods[u.id] || 0) + 1;
      u.apply(this.ship);
      TD.Audio.cartAdd();
      // keep current hull/shield within new caps
      const maxH = this.ship.baseHull + this.ship.stats.maxHull;
      this.ship.hull = Math.min(this.ship.hull, maxH);
      this.toast("🎁 " + u.name + " added!", "good");
      this.closeShop();
    },
    rerollShop() {
      if (this.rerolls <= 0) return;
      this.rerolls--;
      TD.UI.openShop(this, TD.Upgrades.roll(this.ship, 3));
    },
    closeShop() {
      this.state = "play";
      TD.Input.enabled = true;
      TD.UI.closeShop();
      if (this.pendingBoss && !this.bossActive) { this.pendingBoss = false; this.spawnBoss(); }
      else if (this.pendingMini) { this.pendingMini = false; this.spawnMiniboss(); }
    },
    togglePause() {
      if (this.state === "play") { this.state = "paused"; TD.Input.enabled = false; TD.UI.pause(true); }
      else if (this.state === "paused") { this.state = "play"; TD.Input.enabled = true; TD.UI.pause(false); }
    },

    /* ---------- fx ---------- */
    shake(a) { this.shakeAmt = Math.min(this.shakeAmt + a, 26); },
    hitstop(t) { this.hitStop = Math.min(0.12, Math.max(this.hitStop, t)); },
    screenFlash(color, a) { if (a > this.flashA) { this.flashA = a; this.flashColor = color; } },
    vignettePulse(a) { if (a > this.vignetteA) this.vignetteA = a; },
    kick(mag, ang) { this.kickX += Math.cos(ang) * mag; this.kickY += Math.sin(ang) * mag; },
    addPop(x, y, r, color, opts) {
      opts = opts || {};
      this.pops.push({ x, y, r0: r * 0.32, r1: r, color, fill: opts.fill,
        w: opts.w || 3, life: opts.life || 0.32, maxLife: opts.life || 0.32 });
    },
    addFloater(x, y, text, color, opts) {
      opts = opts || {};
      if (this.floaters.length > 12) this.floaters.shift();
      this.floaters.push({ x, y, text, color, vy: opts.vy || -46, size: opts.size || 16,
        t: 0, life: opts.life || 0.7, maxLife: opts.life || 0.7 });
    },
    // fx animate on REAL dt so they keep moving during hit-stop
    updateFx(dt) {
      if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 3.4);
      if (this.vignetteA > 0) this.vignetteA = Math.max(0, this.vignetteA - dt * 2.4);
      this.kickX *= Math.exp(-13 * dt); this.kickY *= Math.exp(-13 * dt);
      if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 42);
      if (this.pops && this.pops.length) {
        for (const p of this.pops) p.life -= dt;
        this.pops = this.pops.filter((p) => p.life > 0);
      }
      if (this.floaters && this.floaters.length) {
        for (const f of this.floaters) { f.t += dt; f.life -= dt; f.y += f.vy * dt; f.vy *= Math.exp(-2.6 * dt); }
        this.floaters = this.floaters.filter((f) => f.life > 0);
      }
    },
    spark(x, y, color, n, scale) {
      scale = scale || 1;
      if (this.particles.length > 170) n = Math.min(n, 2);
      for (let i = 0; i < n; i++) {
        const a = M.rand(0, M.TAU), sp = M.rand(40, 180) * S.unit * scale;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: M.rand(0.2, 0.45), maxLife: 0.45, r: M.rand(1, 2.4) * scale * S.unit, color, kind: "spark" });
      }
    },
    explode(x, y, color, r) {
      let n = Math.min(5 + (r * 0.35 | 0), 14);
      if (this.particles.length > 170) n = Math.min(n, 5);
      for (let i = 0; i < n; i++) {
        const a = M.rand(0, M.TAU), sp = M.rand(50, 260) * S.unit;
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: M.rand(0.3, 0.7), maxLife: 0.7, r: M.rand(1.5, 3.5) * S.unit, color, kind: "spark" });
      }
      this.ring(x, y, r * 1.8, color);
    },
    ring(x, y, r, color) {
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.34, maxLife: 0.34, r0: r * 0.3, r1: r, color, kind: "ring" });
    },
    flashMuzzle(x, y, ang, color, scale) {
      scale = scale || 1;
      this.particles.push({ x, y, ang, life: 0.08, maxLife: 0.08, r: 7 * scale * S.unit, color, kind: "muzzle" });
    },
    addLightning(ax, ay, bx, by) { this.lightnings.push({ ax, ay, bx, by, life: 0.12 }); },
    toast(msg, kind) { TD.UI.toast(msg, kind); },

    /* ====================================================
       UPDATE
    ==================================================== */
    update(dt) {
      this.time += dt;
      // day / wave timer
      this.dayTimer -= dt;
      if (this.dayTimer <= 0) {
        this.dayTimer = 28; this.day++;
        this.toast("📅 DAY " + this.day + " — deals intensify", "bad");
      }
      this.flashTimer -= dt; if (this.flashTimer < 0) this.flashTimer = 9;

      this.updateShip(dt);
      this.updateDrones(dt);
      TD.Director.update(this, dt);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updateEnemyShots(dt);
      this.updateZones(dt);
      this.updateCoins(dt);
      this.updatePickups(dt);
      this.updateParticles(dt);
      for (const l of this.lightnings) l.life -= dt;
      this.lightnings = this.lightnings.filter((l) => l.life > 0);
      this.collisions(dt);
    },

    updateShip(dt) {
      const s = this.ship, st = s.stats;
      this.updatePrizes(dt);
      const tdL = this.prizeLvl("twoday");
      const moveBoost = 1 + 0.16 * tdL;
      if (TD.Input.active) {
        const tx = TD.Input.x, ty = TD.Input.y;
        const dl = M.wrapDelta(s.x, s.y, tx, ty, S.W, S.H);
        const target = Math.atan2(dl.dy, dl.dx);
        const turn = 7.2 * st.turn * dt;
        s.angle = M.angToward(s.angle, target, turn);
        // thrust toward facing if pointer isn't basically on top of the ship
        if (dl.d > s.r * 0.8) {
          const f = 780 * st.thrust * S.unit * moveBoost;
          s.vx += Math.cos(s.angle) * f * dt;
          s.vy += Math.sin(s.angle) * f * dt;
          s.flame = Math.min(1, s.flame + dt * 6);
          if (Math.random() < 0.3) this.thrustParticle();
          if (tdL > 0) this.burnTrail(tdL, dt);
        } else s.flame = Math.max(0, s.flame - dt * 6);
      } else s.flame = Math.max(0, s.flame - dt * 6);

      // drag + speed cap
      const drag = Math.exp(-0.9 * dt);
      s.vx *= drag; s.vy *= drag;
      const maxSp = 320 * st.moveSpeed * S.unit * moveBoost;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > maxSp) { s.vx = s.vx / sp * maxSp; s.vy = s.vy / sp * maxSp; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      this.wrap(s);

      if (s.invuln > 0) s.invuln -= dt;
      if (s.dodgeFlash > 0) s.dodgeFlash -= dt;
      s.hitTimer += dt;
      // shield regen (+ Black-Star overcharge)
      const overcap = Math.min(st.maxShield + this.prizeLvl("blackstar") * 25, this.fieldCap());
      if (s.hitTimer >= st.shieldDelay && s.shield < overcap) {
        const rate = s.shield < st.maxShield ? st.shieldRegen : st.shieldRegen * 0.4 + 3;
        s.shield = Math.min(overcap, s.shield + rate * dt);
      }
      // hull regen
      if (st.hullRegen > 0) this.healHull(st.hullRegen * dt);
      // thorns aura
      if (st.thorns > 0) {
        const R = s.r * 3.4;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - s.x, e.y - s.y) < R + e.r) this.damageEnemy(e, st.thorns * dt, false, e);
        }
      }
      // auto-fire
      s.fireCD -= dt;
      const w = TD.WEAPONS[st.weapon];
      const rate = w.rate * st.fireRate * (s.fireMul || 1);
      let guard = 0;
      while (s.fireCD <= 0 && rate > 0 && guard < 4) {
        w.fire(this, s);
        this.onShotFired();
        s.fireCD += 1 / rate;
        guard++;
      }
      if (guard > 0) TD.Audio.shoot(st.weapon);
      if (rate <= 0) s.fireCD = 0.1;
      TD.Audio.setThrust(s.flame);
    },
    thrustParticle() {
      const s = this.ship;
      if (this.particles.length > 170) return;
      const a = s.angle + Math.PI + M.rand(-0.3, 0.3);
      const px = s.x + Math.cos(s.angle + Math.PI) * s.r;
      const py = s.y + Math.sin(s.angle + Math.PI) * s.r;
      this.particles.push({ x: px, y: py, vx: Math.cos(a) * 120 * S.unit + s.vx * 0.3, vy: Math.sin(a) * 120 * S.unit + s.vy * 0.3,
        life: 0.3, maxLife: 0.3, r: M.rand(1.5, 3) * S.unit, color: M.chance(0.4) ? "#ffd14d" : "#ff7a2b", kind: "spark" });
    },

    updateDrones(dt) {
      const s = this.ship;
      for (const d of s.drones) {
        d.ang += d.spin * dt;
        d.x = s.x + Math.cos(d.ang) * d.dist * S.unit;
        d.y = s.y + Math.sin(d.ang) * d.dist * S.unit;
        d.fireCD -= dt;
        if (d.fireCD <= 0) {
          const t = TD.weaponNearest(this, d.x, d.y, 320 * S.unit);
          if (t) {
            const a = Math.atan2(t.y - d.y, t.x - d.x);
            const crit = M.chance(s.stats.critChance);
            this.projectiles.push({ x: d.x, y: d.y, vx: Math.cos(a) * 700 * S.unit, vy: Math.sin(a) * 700 * S.unit,
              r: 3.4 * S.unit, dmg: (7 * s.stats.damage * (s.damageMul || 1)) * (crit ? s.stats.critMult : 1), life: 0.9, maxLife: 0.9,
              pierce: 0, hits: new Set(), color: "#9bffe0", glow: 9, crit, kind: "bolt", homing: 0, splash: 0 });
            d.fireCD = 0.5;
          } else d.fireCD = 0.15;
        }
      }
    },

    updateEnemies(dt) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.def.update(e, this, dt);
        if (e.def.isBoss || e.def.isMini) {
          e.x += e.vx * dt; e.y += e.vy * dt;        // big units move at full speed
          const m = e.r;                              // and stay on-screen instead of wrapping
          if (e.x < m) { e.x = m; if (e.vx < 0) e.vx = -e.vx * 0.5; }
          else if (e.x > S.W - m) { e.x = S.W - m; if (e.vx > 0) e.vx = -e.vx * 0.5; }
          if (e.y < m) { e.y = m; if (e.vy < 0) e.vy = -e.vy * 0.5; }
          else if (e.y > S.H - m) { e.y = S.H - m; if (e.vy > 0) e.vy = -e.vy * 0.5; }
        } else {
          e.x += e.vx * dt * 0.75; e.y += e.vy * dt * 0.75; // 25% slower swarms
          this.wrap(e);
        }
        if (e.flashHit > 0) e.flashHit -= dt;
        if (e.born < 1) e.born = Math.min(1, e.born + dt * 9);
        if (e.hitScale > 1) e.hitScale = 1 + (e.hitScale - 1) * Math.exp(-17 * dt);
        if (e.contactCD > 0) e.contactCD -= dt;
      }
      this.enemies = this.enemies.filter((e) => !e.dead);
    },

    updateProjectiles(dt) {
      const W = S.W, H = S.H;
      for (const p of this.projectiles) {
        if (p.dead) continue;
        p.age = (p.age || 0) + dt;
        if (p.kind === "blade") {
          p.spinA = (p.spinA || 0) + p.spin * dt;
          if (p.ret && p.age > p.maxLife * 0.42) {
            if (!p.returning) { p.returning = true; p.hits.clear(); }
            const o = p.owner;
            const a = Math.atan2(o.y - p.y, o.x - p.x);
            const sp = Math.hypot(p.vx, p.vy);
            const ca = Math.atan2(p.vy, p.vx);
            const na = M.angToward(ca, a, 9 * dt);
            p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
            if (Math.hypot(o.x - p.x, o.y - p.y) < o.r + p.r) p.dead = true;
          }
        } else if (p.homing) {
          if (!p.target || p.target.dead) p.target = TD.weaponNearest(this, p.x, p.y, 420 * S.unit);
          if (p.target) {
            const a = Math.atan2(p.target.y - p.y, p.target.x - p.x);
            const sp = Math.hypot(p.vx, p.vy) || 1;
            const ca = Math.atan2(p.vy, p.vx);
            const na = M.angToward(ca, a, (p.turnRate || 4) * dt);
            p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
          }
        }
        if (p.kind === "missile" && p.accel) {
          const sp = Math.hypot(p.vx, p.vy);
          if (sp < p.maxSpeed) {
            const a = Math.atan2(p.vy, p.vx);
            p.vx += Math.cos(a) * p.accel * dt; p.vy += Math.sin(a) * p.accel * dt;
          }
          if (Math.random() < 0.3 && this.particles.length < 170) this.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.1, vy: -p.vy * 0.1,
            life: 0.25, maxLife: 0.25, r: 2 * S.unit, color: "#ffb15a", kind: "spark" });
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (this.offscreen(p, p.r + 4)) p.dead = true; // bullets do NOT wrap
        p.life -= dt;
        if (p.life <= 0) p.dead = true;
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    },

    updateEnemyShots(dt) {
      for (const b of this.enemyShots) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.bounce > 0) {
          // ricochet off screen edges (monkey bananas), losing a bounce each time
          const pad = b.r;
          if (b.x < pad && b.vx < 0) { b.vx = -b.vx; b.x = pad; b.bounce--; }
          else if (b.x > S.W - pad && b.vx > 0) { b.vx = -b.vx; b.x = S.W - pad; b.bounce--; }
          if (b.y < pad && b.vy < 0) { b.vy = -b.vy; b.y = pad; b.bounce--; }
          else if (b.y > S.H - pad && b.vy > 0) { b.vy = -b.vy; b.y = S.H - pad; b.bounce--; }
        } else if (this.offscreen(b, b.r + 4)) b.dead = true; // bullets do NOT wrap
        b.life -= dt;
      }
      this.enemyShots = this.enemyShots.filter((b) => b.life > 0 && !b.dead);
    },

    // a telegraphed danger circle that detonates into a bullet ring when it expires
    telegraphZone(x, y, r, delay, n) {
      if (!this.zones) this.zones = [];
      if (this.zones.length > 12) return;
      this.zones.push({ x, y, r, t: delay, max: delay, n: n || 14 });
    },
    updateZones(dt) {
      if (!this.zones || !this.zones.length) return;
      for (const z of this.zones) {
        z.t -= dt;
        if (z.t <= 0) {
          this.shake(5); this.ring(z.x, z.y, z.r, "#ff7a4d");
          const off = M.rand(0, 1);
          for (let i = 0; i < z.n; i++) {
            const a = (i / z.n + off) * M.TAU;
            this.enemyShots.push({ x: z.x, y: z.y, vx: Math.cos(a) * 190 * S.unit, vy: Math.sin(a) * 190 * S.unit,
              r: 6 * S.unit, dmg: 12, life: 4, color: "#ffb24d", glow: 12 });
          }
          z.dead = true;
        }
      }
      this.zones = this.zones.filter((z) => !z.dead);
    },

    updateCoins(dt) {
      const s = this.ship;
      const range = (s.r + 80 * S.unit) * s.stats.pickup;
      for (const c of this.coins) {
        c.t += dt; c.life -= dt;
        const dl = M.wrapDelta(c.x, c.y, s.x, s.y, S.W, S.H);
        if (dl.d < range) {
          const a = Math.atan2(dl.dy, dl.dx);
          const pull = M.lerp(420, 120, M.clamp(dl.d / range, 0, 1)) * S.unit;
          c.vx += Math.cos(a) * pull * dt * 3;
          c.vy += Math.sin(a) * pull * dt * 3;
        }
        c.vx *= Math.exp(-2 * dt); c.vy *= Math.exp(-2 * dt);
        c.x += c.vx * dt; c.y += c.vy * dt;
        this.wrap(c);
        if (dl.d < s.r + c.r) { c.dead = true; this.collectCoin(c); }
      }
      this.coins = this.coins.filter((c) => !c.dead && c.life > 0);
    },
    updatePickups(dt) {
      const s = this.ship;
      for (const p of this.pickups) {
        p.t += dt; p.life -= dt;
        const dl = M.wrapDelta(p.x, p.y, s.x, s.y, S.W, S.H);
        if (dl.d < s.r + p.r) {
          p.dead = true;
          this.healHull((s.baseHull + s.stats.maxHull) * 0.25);
          this.restoreField();
          TD.Audio.heal();
          this.toast("🎁 Free sample! +25% hull", "good");
          this.ring(s.x, s.y, s.r * 3, "#19c37d");
        }
      }
      this.pickups = this.pickups.filter((p) => !p.dead && p.life > 0);
    },

    updateParticles(dt) {
      for (const p of this.particles) {
        p.life -= dt;
        if (p.kind === "spark") {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt);
        }
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    },

    /* ---------- collisions ---------- */
    collisions(dt) {
      const s = this.ship;
      // player projectiles vs enemies
      for (const p of this.projectiles) {
        if (p.dead) continue;
        for (const e of this.enemies) {
          if (e.dead || (p.hits && p.hits.has(e))) continue;
          if (this.hitEnemy(e, p.x, p.y, p.r)) {
            this.damageEnemy(e, p.dmg, p.crit, { x: p.x, y: p.y });
            if (p.splash > 0) this.explodeAt(p.x, p.y, p.splash, p.dmg * (s.stats.splashDmg || 0.4), e);
            if (p.hits) p.hits.add(e);
            if (p.kind !== "blade") {
              if (p.pierce > 0) p.pierce--;
              else { p.dead = true; break; }
            }
          }
        }
      }
      // enemy shots vs ship
      for (const b of this.enemyShots) {
        if (b.dead) continue;
        const rr = b.r + s.r;
        const dl = M.wrapDelta(b.x, b.y, s.x, s.y, S.W, S.H);
        if (dl.dx * dl.dx + dl.dy * dl.dy < rr * rr) {
          if (s.stats.reflect && s.shield > 0 && s.invuln <= 0) {
            // bounce it back as ours
            const a = Math.atan2(s.y - b.y, s.x - b.x) + Math.PI;
            const sp = Math.hypot(b.vx, b.vy) * 1.1;
            this.projectiles.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              r: b.r, dmg: 18 * s.stats.damage, life: 1.4, maxLife: 1.4, pierce: 1, hits: new Set(),
              color: "#7af1ff", glow: 12, kind: "bolt", homing: 0, splash: 0 });
            b.dead = true; this.spark(b.x, b.y, "#7af1ff", 3);
          } else { this.damageShip(b.dmg); b.dead = true; }
        }
      }
      // enemies vs ship (contact)
      for (const e of this.enemies) {
        if (e.dead) continue;
        const rr = e.r + s.r;
        const dl = M.wrapDelta(e.x, e.y, s.x, s.y, S.W, S.H);
        let touching = dl.dx * dl.dx + dl.dy * dl.dy < rr * rr;
        if (!touching && e.parts) {            // segmented bosses: test each body part
          for (const pt of e.parts) {
            const r2 = pt.r + s.r;
            if ((pt.x - s.x) * (pt.x - s.x) + (pt.y - s.y) * (pt.y - s.y) < r2 * r2) { touching = true; break; }
          }
        }
        if (touching) {
          // collision damage scales with relative impact speed
          const rvx = s.vx - (e.vx || 0), rvy = s.vy - (e.vy || 0);
          const relSpeed = Math.hypot(rvx, rvy);
          const velF = M.clamp(0.4 + relSpeed / (280 * S.unit), 0.4, 2.4);
          // ram damage to enemy
          if (s.stats.bodyDmg > 0 && (e.contactCD || 0) <= 0) {
            this.damageEnemy(e, s.stats.bodyDmg * velF, false, e);
            e.contactCD = 0.4;
          }
          if (e.dead) continue;
          if (e.def.touchKill) {
            this.killEnemy(e);
            this.damageShip(e.contact * velF * Math.max(0.125, 1 - s.stats.ramArmor));
          } else if ((e.contactHitCD || 0) <= 0) {
            this.damageShip(e.contact * velF * Math.max(0.125, 1 - s.stats.ramArmor));
            e.contactHitCD = 0.55;
            // small knockback
            const a = Math.atan2(dl.dy, dl.dx);
            s.vx += Math.cos(a) * 120; s.vy += Math.sin(a) * 120;
          }
        }
        if (e.contactHitCD > 0) e.contactHitCD -= dt;
      }
    },

    wrap(o) {
      const W = S.W, H = S.H;
      if (o.x < 0) o.x += W; else if (o.x >= W) o.x -= W;
      if (o.y < 0) o.y += H; else if (o.y >= H) o.y -= H;
    },

    /* ====================================================
       RENDER
    ==================================================== */
    makeStars() {
      const n = Math.round((S.W * S.H) / 9000);
      this.stars = [];
      for (let i = 0; i < n; i++) {
        this.stars.push({ x: Math.random() * S.W, y: Math.random() * S.H,
          z: M.rand(0.3, 1), s: M.rand(0.4, 1.6), tw: M.rand(0, 6) });
      }
    },

    loop(t) {
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > 0.05) dt = 0.05; // clamp big gaps
      let sim = dt;
      if (this.hitStop > 0) { this.hitStop -= dt; sim = dt * 0.05; } // freeze-frame juice
      if (this.state === "play") this.update(sim);
      this.updateFx(dt);
      this.render(dt);
      // HUD throttle
      this.hudT -= dt;
      if (this.hudT <= 0 && (this.state === "play" || this.state === "paused")) { TD.UI.updateHUD(this); this.hudT = 0.07; }
      requestAnimationFrame((tt) => this.loop(tt));
    },

    offscreen(o, pad) {
      pad = pad == null ? (o.r || 0) : pad;
      return o.x < -pad || o.x > S.W + pad || o.y < -pad || o.y > S.H + pad;
    },
    drawAt(x, y, cb) { cb(x, y); },
    eachWrap(x, y, r, cb) {
      const W = S.W, H = S.H, m = r + 40;
      const xs = [x]; if (x < m) xs.push(x + W); if (x > W - m) xs.push(x - W);
      const ys = [y]; if (y < m) ys.push(y + H); if (y > H - m) ys.push(y - H);
      for (const xx of xs) for (const yy of ys) cb(xx, yy);
    },

    render(dt) {
      const ctx = this.ctx, W = S.W, H = S.H;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      // background
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0a0a1c"); g.addColorStop(1, "#05050f");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // starfield
      const tt = this.time || (performance.now() / 1000);
      for (const st of this.stars) {
        const a = 0.4 + 0.6 * Math.abs(Math.sin(tt * 0.8 + st.tw)) * st.z;
        ctx.globalAlpha = a; ctx.fillStyle = st.z > 0.7 ? "#bcd2ff" : "#5a6a9a";
        ctx.fillRect(st.x, st.y, st.s, st.s);
      }
      ctx.globalAlpha = 1;

      // shake + directional kick
      ctx.save();
      let sx = this.kickX || 0, sy = this.kickY || 0;
      if (this.shakeAmt > 0) { sx += M.rand(-1, 1) * this.shakeAmt; sy += M.rand(-1, 1) * this.shakeAmt; }
      if (sx || sy) ctx.translate(sx, sy);

      if (this.ship) {
        this.renderPickups(ctx);
        this.renderCoins(ctx);
        this.renderZones(ctx);
        this.renderEnemyShots(ctx);
        this.renderProjectiles(ctx);
        this.renderLightning(ctx);
        this.renderEnemies(ctx);
        this.renderShip(ctx);
        this.renderParticles(ctx);
        this.renderPops(ctx);
        this.renderFloaters(ctx);
        this.renderReticle(ctx);
      }
      ctx.restore();

      // screen-space flash + damage vignette (juice)
      if (this.flashA > 0.002) {
        ctx.globalAlpha = Math.min(0.85, this.flashA); ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      }
      if (this.vignetteA > 0.002) {
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.64);
        vg.addColorStop(0, "rgba(255,40,60,0)");
        vg.addColorStop(1, "rgba(255,24,44," + this.vignetteA.toFixed(3) + ")");
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }

      if (this.state === "paused") this.renderPausedOverlay(ctx);
    },

    renderPops(ctx) {
      for (const p of this.pops) {
        const k = M.clamp(p.life / p.maxLife, 0, 1);
        const r = M.lerp(p.r0, p.r1, 1 - k);
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.w * k + 0.6;
        ctx.shadowColor = p.color; ctx.shadowBlur = 16 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, M.TAU); ctx.stroke();
        if (p.fill && k > 0.5) {
          ctx.globalAlpha = (k - 0.5) * 1.7; ctx.fillStyle = p.fill;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55, 0, M.TAU); ctx.fill();
        }
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    },
    renderFloaters(ctx) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const f of this.floaters) {
        const k = M.clamp(f.life / f.maxLife, 0, 1);
        const pop = f.t < 0.12 ? 1 + (0.12 - f.t) * 3.2 : 1; // scale-in punch
        ctx.globalAlpha = k;
        ctx.font = "800 " + (f.size * pop * S.unit).toFixed(1) + "px 'Baloo 2', sans-serif";
        ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(0,0,0,.5)";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1; ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    },

    renderReticle(ctx) {
      if (!TD.Input.active || this.state !== "play") return;
      const x = TD.Input.x, y = TD.Input.y;
      ctx.globalAlpha = 0.5; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 14 * S.unit, 0, M.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, M.TAU); ctx.fillStyle = "#fff"; ctx.fill();
      ctx.globalAlpha = 1;
    },

    renderShip(ctx) {
      const s = this.ship;
      if (s.invuln > 0 && Math.floor(s.invuln * 20) % 2 === 0 && s.hull > 0 && this.state === "play") {
        // blink during i-frames (skip draw some frames) but still show shield
      }
      this.eachWrap(s.x, s.y, s.r * 5, (x, y) => {
        ctx.save(); ctx.translate(x, y);
        // shield bubble
        const sf = s.shield / Math.max(1, s.stats.maxShield);
        if (sf > 0.01) {
          ctx.beginPath(); ctx.arc(0, 0, s.r * 1.9, 0, M.TAU);
          ctx.strokeStyle = "rgba(122,241,255," + (0.25 + 0.45 * sf) + ")";
          ctx.lineWidth = 2 + 2 * sf; ctx.shadowColor = "#37f0ff"; ctx.shadowBlur = 10; ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.rotate(s.angle);
        // thruster flame
        if (s.flame > 0.05) {
          const fl = s.flame * (0.8 + Math.random() * 0.4);
          ctx.beginPath();
          ctx.moveTo(-s.r * 0.6, s.r * 0.45); ctx.lineTo(-s.r * (1.1 + fl * 1.4), 0); ctx.lineTo(-s.r * 0.6, -s.r * 0.45);
          ctx.closePath();
          ctx.fillStyle = "#ffb347"; ctx.shadowColor = "#ff7a2b"; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
        }
        // hull — chassis-specific silhouette
        const inv = (s.invuln > 0 || s.dodgeFlash > 0) && this.state === "play";
        if (s.chassis && s.chassis.draw) {
          s.chassis.draw(ctx, s.r, inv);
        } else {
          ctx.beginPath();
          ctx.moveTo(s.r * 1.4, 0); ctx.lineTo(-s.r, s.r * 0.85); ctx.lineTo(-s.r * 0.5, 0); ctx.lineTo(-s.r, -s.r * 0.85);
          ctx.closePath();
          ctx.fillStyle = inv ? "#ffffff" : "#5ce0ff";
          ctx.strokeStyle = inv ? "#bfe6ff" : "#5ce0ff"; ctx.lineWidth = 2.4;
          ctx.shadowColor = "#37f0ff"; ctx.shadowBlur = 12; ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.arc(s.r * 0.25, 0, s.r * 0.28, 0, M.TAU);
          ctx.fillStyle = "#bdf3ff"; ctx.fill();
        }
        ctx.restore();
      });
      // drones
      for (const d of s.drones) {
        this.eachWrap(d.x, d.y, 12 * S.unit, (x, y) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(d.ang * 2);
          ctx.beginPath(); ctx.moveTo(6 * S.unit, 0); ctx.lineTo(-5 * S.unit, 4 * S.unit); ctx.lineTo(-5 * S.unit, -4 * S.unit);
          ctx.closePath(); ctx.fillStyle = "rgba(30,80,70,.7)"; ctx.strokeStyle = "#52ffce"; ctx.lineWidth = 1.6;
          ctx.shadowColor = "#52ffce"; ctx.shadowBlur = 8; ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          ctx.restore();
        });
      }
    },

    renderEnemies(ctx) {
      for (const e of this.enemies) {
        const cb = (x, y) => {
          ctx.save(); ctx.translate(x, y);
          if (e.born < 1 || e.hitScale > 1) {
            const b = e.born < 1 ? 1 - (1 - e.born) * (1 - e.born) : 1; // easeOut
            const sc = (e.born < 1 ? 0.35 + 0.65 * b : 1) * (e.hitScale || 1);
            ctx.scale(sc, sc);
          }
          if (e.flashHit > 0) { ctx.globalAlpha = 1; }
          e.def.draw(e, ctx, this);
          if (e.flashHit > 0) {
            ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, M.TAU);
            ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.globalAlpha = 1;
          }
          ctx.restore();
          if (e.def.isBoss || e.def.isMini) this.renderBossBar(ctx, e, x, y);
        };
        // bosses & minibosses don't wrap (and segmented ones draw in world space) — draw once
        if (e.def.isBoss || e.def.isMini) cb(e.x, e.y);
        else this.eachWrap(e.x, e.y, e.r + 30, cb);
      }
    },
    renderBossBar(ctx, e, x, y) {
      const w = e.r * 2.4, h = 7 * S.unit, yy = y - e.r - 18 * S.unit;
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x - w / 2, yy, w, h);
      const f = M.clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = f > 0.35 ? "#ff5a4d" : "#ffd23b";
      ctx.fillRect(x - w / 2, yy, w * f, h);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.strokeRect(x - w / 2, yy, w, h);
    },

    renderProjectiles(ctx) {
      for (const p of this.projectiles) {
        this.drawAt(p.x, p.y, (x, y) => {
          ctx.save(); ctx.translate(x, y);
          ctx.shadowColor = p.color; ctx.shadowBlur = p.glow || 10;
          if (p.kind === "beam" || p.kind === "slug") {
            const a = Math.atan2(p.vy, p.vx); ctx.rotate(a);
            const len = p.kind === "slug" ? p.r * 3.4 : p.r * 3;
            ctx.strokeStyle = p.color; ctx.lineWidth = p.r * 1.6; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(len, 0); ctx.stroke();
          } else if (p.kind === "blade") {
            ctx.rotate(p.spinA || 0);
            ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.lineCap = "round";
            for (let i = 0; i < 3; i++) { ctx.rotate(M.TAU / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.r, 0); ctx.stroke(); }
          } else if (p.kind === "missile") {
            const a = Math.atan2(p.vy, p.vx); ctx.rotate(a);
            ctx.fillStyle = p.color; ctx.beginPath();
            ctx.moveTo(p.r * 1.6, 0); ctx.lineTo(-p.r, p.r * 0.7); ctx.lineTo(-p.r, -p.r * 0.7); ctx.closePath(); ctx.fill();
          } else {
            ctx.beginPath(); ctx.arc(0, 0, p.r, 0, M.TAU); ctx.fillStyle = p.color; ctx.fill();
            if (p.crit) { ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff"; ctx.stroke(); }
          }
          ctx.restore();
        });
      }
      ctx.shadowBlur = 0;
    },

    renderZones(ctx) {
      if (!this.zones) return;
      for (const z of this.zones) {
        const k = M.clamp(1 - z.t / z.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.22 * k;
        ctx.fillStyle = "#ff5a2d";
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, M.TAU); ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = "#ffb24d"; ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 6]); ctx.lineDashOffset = -k * 24;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, M.TAU); ctx.stroke();
        // filling-in inner radius shows imminence
        ctx.setLineDash([]); ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r * k, 0, M.TAU); ctx.strokeStyle = "#fff3c4"; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    renderEnemyShots(ctx) {
      for (const b of this.enemyShots) {
        this.drawAt(b.x, b.y, (x, y) => {
          ctx.beginPath(); ctx.arc(x, y, b.r, 0, M.TAU);
          ctx.fillStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = b.glow || 8; ctx.fill();
        });
      }
      ctx.shadowBlur = 0;
    },

    renderCoins(ctx) {
      for (const c of this.coins) {
        const blink = c.life < 3 ? (Math.sin(c.life * 12) > -0.3 ? 1 : 0.25) : 1;
        this.eachWrap(c.x, c.y, c.r + 12, (x, y) => {
          ctx.save(); ctx.translate(x, y); ctx.globalAlpha = blink;
          ctx.rotate(Math.sin(c.t * 3) * 0.5);
          if (c.big) {
            // chunky "10×" coin: double rim, brighter glow, sparkle
            ctx.beginPath(); ctx.arc(0, 0, c.r, 0, M.TAU);
            ctx.fillStyle = "#ffcf2e"; ctx.shadowColor = "#ffb300"; ctx.shadowBlur = 16; ctx.fill();
            ctx.strokeStyle = "#fff6cf"; ctx.lineWidth = 2.4; ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, c.r * 0.62, 0, M.TAU);
            ctx.strokeStyle = "#c98a00"; ctx.lineWidth = 1.6; ctx.stroke();
            ctx.shadowBlur = 0;
            // 4-point sparkle
            ctx.strokeStyle = "#fffbe6"; ctx.lineWidth = 2;
            const sp = c.r * 0.5 * (0.85 + 0.15 * Math.sin(c.t * 6));
            ctx.beginPath(); ctx.moveTo(-sp, 0); ctx.lineTo(sp, 0); ctx.moveTo(0, -sp); ctx.lineTo(0, sp); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.arc(0, 0, c.r, 0, M.TAU);
            ctx.fillStyle = "#ffd23b"; ctx.shadowColor = "#ffb300"; ctx.shadowBlur = 10; ctx.fill();
            ctx.strokeStyle = "#fff3c4"; ctx.lineWidth = 1.4; ctx.stroke();
            ctx.shadowBlur = 0;
          }
          ctx.globalAlpha = 1; ctx.restore();
        });
      }
    },
    renderPickups(ctx) {
      for (const p of this.pickups) {
        const pulse = 1 + Math.sin(p.t * 5) * 0.12;
        this.eachWrap(p.x, p.y, p.r + 14, (x, y) => {
          ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
          ctx.beginPath(); ctx.arc(0, 0, p.r, 0, M.TAU);
          ctx.fillStyle = "rgba(25,195,125,.2)"; ctx.strokeStyle = "#19c37d"; ctx.lineWidth = 2.4;
          ctx.shadowColor = "#19c37d"; ctx.shadowBlur = 12; ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          // cross
          ctx.strokeStyle = "#bfffe0"; ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.moveTo(-p.r * 0.4, 0); ctx.lineTo(p.r * 0.4, 0);
          ctx.moveTo(0, -p.r * 0.4); ctx.lineTo(0, p.r * 0.4); ctx.stroke();
          ctx.restore();
        });
      }
    },

    renderLightning(ctx) {
      for (const l of this.lightnings) {
        ctx.globalAlpha = M.clamp(l.life / 0.12, 0, 1);
        ctx.strokeStyle = "#bff4ff"; ctx.shadowColor = "#7af1ff"; ctx.shadowBlur = 14; ctx.lineWidth = 2.4;
        const segs = 6; ctx.beginPath(); ctx.moveTo(l.ax, l.ay);
        for (let i = 1; i < segs; i++) {
          const t = i / segs;
          const x = M.lerp(l.ax, l.bx, t) + M.rand(-8, 8);
          const y = M.lerp(l.ay, l.by, t) + M.rand(-8, 8);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(l.bx, l.by); ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    },

    renderParticles(ctx) {
      for (const p of this.particles) {
        const a = M.clamp(p.life / p.maxLife, 0, 1);
        if (p.kind === "ring") {
          const r = M.lerp(p.r0, p.r1, 1 - a);
          ctx.globalAlpha = a * 0.8; ctx.strokeStyle = p.color; ctx.lineWidth = 2.5 * a + 0.5;
          ctx.shadowColor = p.color; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, M.TAU); ctx.stroke();
        } else if (p.kind === "muzzle") {
          ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, M.TAU); ctx.fill();
        } else {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, M.TAU); ctx.fill();
        }
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    },

    renderPausedOverlay(ctx) {
      ctx.fillStyle = "rgba(5,5,15,.55)"; ctx.fillRect(0, 0, S.W, S.H);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "700 " + (28 * S.unit) + "px Baloo 2, sans-serif";
      ctx.fillText("⏸  PAUSED", S.W / 2, S.H / 2 - 6);
      ctx.font = "600 " + (14 * S.unit) + "px Nunito, sans-serif"; ctx.fillStyle = "#cbb9ff";
      ctx.fillText("tap II again to resume shopping", S.W / 2, S.H / 2 + 22);
      ctx.textAlign = "start";
    },
  };

  TD.Game = Game;
})();
