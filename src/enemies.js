/* ============================================================
   VOIDMART — enemies.js
   Enemy archetypes (knock-off "daily deals"), a boss, and the
   spawn director. AI sets velocity / fires; game handles damage.
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;
  const M = TD.math;

  function dToShip(e, game) {
    const s = game.ship;
    const dl = M.wrapDelta(e.x, e.y, s.x, s.y, TD.Screen.W, TD.Screen.H);
    dl.ang = Math.atan2(dl.dy, dl.dx);
    return dl;
  }
  function enemyShot(game, x, y, ang, speed, dmg, color, r) {
    const u = TD.Screen.unit;
    if (game.enemyShots.length > 260) return;
    game.enemyShots.push({
      x, y, vx: Math.cos(ang) * speed * u * 0.75, vy: Math.sin(ang) * speed * u * 0.75,
      r: (r || 5) * u, dmg, life: 4.2, color: color || "#ff5a7a", glow: 10,
    });
  }
  function steer(e, ang, accel, dt, maxSpeed) {
    e.vx += Math.cos(ang) * accel * dt;
    e.vy += Math.sin(ang) * accel * dt;
    const sp = Math.hypot(e.vx, e.vy);
    if (maxSpeed && sp > maxSpeed) { e.vx = e.vx / sp * maxSpeed; e.vy = e.vy / sp * maxSpeed; }
  }
  // Follow-the-leader body chain (position-based). The first segment trails the HEAD at a fixed
  // distance `gap`, and each later segment holds `gap` behind the one in front of it. Because every
  // position is driven only by where its leader physically is, the body flows along the path the
  // head travelled — a pure turn (head rotating without moving) doesn't swing the tail at all — and
  // the spacing stays coherent (no stretching/dotting). Call once per update; e.seg holds the chain.
  function followChain(e, gap, dt) {
    const seg = e.seg, n = seg.length; if (!n) return;
    let lx = e.x, ly = e.y;
    for (let i = 0; i < n; i++) {
      const s = seg[i];
      const g = s.gap != null ? s.gap : gap;   // per-segment spacing keeps a tapering tail connected
      let dx = s.x - lx, dy = s.y - ly, d = Math.hypot(dx, dy);
      if (d < 1e-4) { dx = -Math.cos(e.ang); dy = -Math.sin(e.ang); d = 1; }  // fallback: behind the head
      s.x = lx + dx / d * g; s.y = ly + dy / d * g;
      lx = s.x; ly = s.y;
    }
  }
  // lay a fresh chain straight out behind the head (called from spawn so it starts as a tail)
  function initChain(e, gap) {
    let lx = e.x, ly = e.y;
    for (let i = 0; i < e.seg.length; i++) {
      const s = e.seg[i], g = s.gap != null ? s.gap : gap;
      s.x = lx - Math.cos(e.ang) * g; s.y = ly - Math.sin(e.ang) * g;
      lx = s.x; ly = s.y;
    }
  }

  // ---- boss intelligence helpers ----
  // A point clamped to the arena interior — charge toward THIS, never through a wall.
  function aimPoint(game, margin) {
    const u = TD.Screen.unit, W = TD.Screen.W, H = TD.Screen.H, m = (margin || 70) * u;
    return { x: M.clamp(game.ship.x, m, W - m), y: M.clamp(game.ship.y, m, H - m) };
  }
  // Heading toward (tx,ty), bent away from any wall the unit is hugging, so big
  // units curl along the boundary instead of grinding into it facing outward.
  function approachAng(e, tx, ty) {
    const u = TD.Screen.unit, W = TD.Screen.W, H = TD.Screen.H, m = 110 * u, push = 240 * u;
    let dx = tx - e.x, dy = ty - e.y;
    if (e.x < m) dx += (1 - e.x / m) * push;
    else if (e.x > W - m) dx -= (1 - (W - e.x) / m) * push;
    if (e.y < m) dy += (1 - e.y / m) * push;
    else if (e.y > H - m) dy -= (1 - (H - e.y) / m) * push;
    return Math.atan2(dy, dx);
  }
  // Direction to charge at the player, clamped so it ends beside them, not in a wall.
  function chargeAng(e, game, margin) {
    const p = aimPoint(game, margin);
    return Math.atan2(p.y - e.y, p.x - e.x);
  }

  /* ---- shared neon poly drawing ---- */
  function poly(ctx, n, r, rot, jitter) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * M.TAU;
      const rr = jitter ? r * jitter[i % jitter.length] : r;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function neon(ctx, color, fill, w) {
    const lw = w || 2.4;
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    // 1) outer colored glow stroke
    ctx.lineWidth = lw + 1;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.stroke();
    // 2) bright inner highlight so the outline reads clearly on the dark bg
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, lw * 0.6);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.stroke();
  }

  /* ====================== CATALOG ====================== */
  const E = {
    /* Clearance Boulder — splits into smaller tiers */
    roid: {
      name: "Clearance Boulder", color: "#f0c577", baseHp: 22, contact: 14, score: 30, coins: 3,
      spawn(e) {
        e.tier = e.tier || 3;
        e.r = (8 + e.tier * 7) * TD.Screen.unit;
        e.spin = M.rand(-1.1, 1.1);
        e.verts = [];
        const n = 8 + (e.tier);
        for (let i = 0; i < n; i++) e.verts.push(0.72 + Math.random() * 0.42);
        e.vn = n;
        const a = M.rand(0, M.TAU), sp = M.rand(28, 60) * TD.Screen.unit;
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
      },
      update(e, game, dt) { e.ang += e.spin * dt; },
      die(e, game) {
        if (e.tier > 1) {
          const k = 2;
          for (let i = 0; i < k; i++) {
            const child = game.spawnEnemy("roid", e.x, e.y, { tier: e.tier - 1, hpScale: e.hpScale });
            const a = M.rand(0, M.TAU), sp = M.rand(60, 120) * TD.Screen.unit;
            child.vx = Math.cos(a) * sp; child.vy = Math.sin(a) * sp;
          }
        }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        poly(ctx, e.vn, e.r, 0, e.verts);
        neon(ctx, e.color, "rgba(150,115,65,.34)", 2.2 + e.tier * 0.3);
      },
    },

    /* Bargain Bot — kamikaze homing */
    seeker: {
      name: "Bargain Bot", color: "#ff5a3c", baseHp: 9, contact: 16, score: 25, coins: 2, touchKill: true,
      spawn(e) { e.r = 9 * TD.Screen.unit; e.maxSpeed = M.rand(140, 180) * TD.Screen.unit; },
      update(e, game, dt) {
        const d = dToShip(e, game);
        e.ang = M.lerp(e.ang, d.ang, 0.12);
        steer(e, d.ang, 520 * TD.Screen.unit, dt, e.maxSpeed);
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        ctx.beginPath();
        ctx.moveTo(e.r * 1.3, 0); ctx.lineTo(-e.r, e.r * 0.8); ctx.lineTo(-e.r * 0.4, 0); ctx.lineTo(-e.r, -e.r * 0.8);
        ctx.closePath();
        neon(ctx, e.color, "rgba(255,90,60,.22)", 2.2);
      },
    },

    /* Clearance Drone — yellow glass strafer (modeled on the Rooster's comb drones):
       holds ~200px, sidesteps, spits yellow bullets, pops in a single hit. */
    clearance: {
      name: "Clearance Drone", color: "#ffd23b", baseHp: 1, fixedHp: 1, contact: 12, score: 30, coins: 2,
      spawn(e) { const u = TD.Screen.unit; e.r = 9 * u; e.color = "#ffd23b"; e.t = 0; e.fire = M.rand(0.4, 0.9); e.sdir = M.chance(0.5) ? 1 : -1; e.flip = M.rand(1.4, 2.4); },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        const ideal = 200 * u;
        const err = M.clamp((d.d - ideal) / (90 * u), -1, 1);
        e.flip -= dt; if (e.flip <= 0) { e.flip = M.rand(1.4, 2.6); e.sdir *= -1; }
        const latAng = d.ang + Math.PI / 2 * e.sdir;
        const vx = Math.cos(d.ang) * err + Math.cos(latAng) * 0.9;
        const vy = Math.sin(d.ang) * err + Math.sin(latAng) * 0.9;
        steer(e, Math.atan2(vy, vx), 760 * u, dt, 250 * u);
        e.vx *= 0.92; e.vy *= 0.92;
        e.ang = Math.atan2(e.vy, e.vx);
        e.fire -= dt;
        if (e.fire <= 0) { e.fire = M.rand(0.7, 1.1); enemyShot(game, e.x, e.y, d.ang + M.rand(-0.05, 0.05), 280, 6, "#ffd23b", 4); }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.25, e.r * 0.78, 0, 0, M.TAU);
        neon(ctx, e.color, "rgba(255,210,59,.22)", 2.4);
        ctx.beginPath(); ctx.moveTo(e.r * 1.2, 0); ctx.lineTo(e.r * 0.45, e.r * 0.4); ctx.lineTo(e.r * 0.45, -e.r * 0.4); ctx.closePath();
        ctx.fillStyle = "#fff3b0"; ctx.fill();
      },
    },

    /* Fidget Sentinel — radial bullet bursts */
    spinner: {
      name: "Fidget Sentinel", color: "#3ad6ff", baseHp: 30, contact: 12, score: 55, coins: 4,
      spawn(e) {
        e.r = 15 * TD.Screen.unit; e.spin = M.rand(1.4, 2.4); e.fire = M.rand(1.4, 2.6);
        const a = M.rand(0, M.TAU), sp = M.rand(20, 45) * TD.Screen.unit;
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
      },
      update(e, game, dt) {
        e.ang += e.spin * dt;
        e.fire -= dt;
        if (e.fire <= 0) {
          e.fire = 2.4;
          const n = 9, base = e.ang;
          for (let i = 0; i < n; i++) enemyShot(game, e.x, e.y, base + i / n * M.TAU, 150, 9, "#7af1ff", 5);
          e.flash = 0.12;
        }
        if (e.flash > 0) e.flash -= dt;
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        poly(ctx, 3, e.r, 0);
        neon(ctx, e.color, e.flash > 0 ? "rgba(122,241,255,.5)" : "rgba(58,214,255,.12)", 2.6);
        ctx.rotate(Math.PI / 3);
        poly(ctx, 3, e.r * 0.8, 0);   // 20% smaller + different colour → reads as an inner blade, not a hexagram
        neon(ctx, "#ff5edb", "transparent", 2);
      },
    },

    /* Counterfeit Pod — bursts into seekers */
    splitter: {
      name: "Counterfeit Pod", color: "#c46bff", baseHp: 34, contact: 13, score: 60, coins: 5,
      spawn(e) {
        e.r = 16 * TD.Screen.unit; e.spin = M.rand(-1, 1);
        e.pulse = 0;
      },
      update(e, game, dt) {
        const d = dToShip(e, game);
        steer(e, d.ang, 60 * TD.Screen.unit, dt, 70 * TD.Screen.unit);
        e.ang += e.spin * dt; e.pulse += dt * 3;
      },
      die(e, game) {
        const k = 3;
        for (let i = 0; i < k; i++) {
          const c = game.spawnEnemy("seeker", e.x, e.y, { hpScale: e.hpScale });
          const a = (i / k) * M.TAU + M.rand(-0.3, 0.3), sp = 130 * TD.Screen.unit;
          c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp;
        }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        const s = 1 + Math.sin(e.pulse) * 0.06;
        poly(ctx, 6, e.r * s, 0);
        neon(ctx, e.color, "rgba(196,107,255,.16)", 2.6);
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.4, 0, M.TAU);
        neon(ctx, "#ff9cf0", "rgba(255,156,240,.3)", 2);
      },
    },

    /* Mega-Pallet — slow armored tank that charges */
    bulwark: {
      name: "Mega-Pallet", color: "#ff9d2b", baseHp: 120, contact: 22, score: 120, coins: 9,
      spawn(e) {
        e.r = 24 * TD.Screen.unit; e.charge = M.rand(2.5, 4); e.charging = 0; e.face = 0;
      },
      update(e, game, dt) {
        const d = dToShip(e, game);
        e.face = M.angToward(e.face, d.ang, 1.4 * dt);
        if (e.charging > 0) {
          e.charging -= dt;
          steer(e, e.face, 460 * TD.Screen.unit, dt, 320 * TD.Screen.unit);
          if (e.charging <= 0) { e.vx *= 0.3; e.vy *= 0.3; }
        } else {
          steer(e, d.ang, 30 * TD.Screen.unit, dt, 46 * TD.Screen.unit);
          e.charge -= dt;
          if (e.charge <= 0 && d.d < 360 * TD.Screen.unit) {
            e.charge = M.rand(3, 5); e.charging = 0.9; e.windup = 0.35;
          }
        }
        if (e.windup > 0) e.windup -= dt;
        e.ang = e.face;
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        poly(ctx, 8, e.r, 0);
        neon(ctx, e.charging > 0 ? "#ffd14d" : e.color, "rgba(255,157,43,.14)", 3.2);
        // armored front arc — alarming BLUE neon shield (big glow + bright core)
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.97, -0.9, 0.9);
        ctx.strokeStyle = "#7cc4ff"; ctx.shadowColor = "#3aa0ff"; ctx.lineWidth = 7;
        ctx.shadowBlur = 30; ctx.stroke(); ctx.shadowBlur = 16; ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.lineCap = "butt";
      },
    },

    /* Price-Gouger — keeps distance, aimed shots */
    sniper: {
      name: "Price-Gouger", color: "#ff4d9d", baseHp: 26, contact: 12, score: 70, coins: 5,
      spawn(e) { e.r = 13 * TD.Screen.unit; e.fire = M.rand(1.2, 2.4); },
      update(e, game, dt) {
        const d = dToShip(e, game);
        const ideal = 320 * TD.Screen.unit;
        if (d.d < ideal - 40) steer(e, d.ang + Math.PI, 200 * TD.Screen.unit, dt, 130 * TD.Screen.unit);
        else if (d.d > ideal + 60) steer(e, d.ang, 160 * TD.Screen.unit, dt, 120 * TD.Screen.unit);
        else { e.vx *= 0.96; e.vy *= 0.96; steer(e, d.ang + Math.PI / 2, 70 * TD.Screen.unit, dt, 110 * TD.Screen.unit); }
        e.ang = d.ang;
        e.fire -= dt;
        if (e.fire <= 0 && d.d < 520 * TD.Screen.unit) {
          e.fire = M.rand(1.6, 2.4);
          enemyShot(game, e.x, e.y, d.ang, 300, 12, "#ff7ab8", 5);
          e.flash = 0.1;
        }
        if (e.flash > 0) e.flash -= dt;
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        poly(ctx, 4, e.r, 0);
        neon(ctx, e.color, e.flash > 0 ? "rgba(255,122,184,.5)" : "rgba(255,77,157,.14)", 2.4);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.r * 1.5, 0);
        ctx.strokeStyle = "#ffd0e6"; ctx.lineWidth = 2; ctx.stroke();
      },
    },

    /* Drifting Deal — proximity mine */
    mine: {
      name: "Drifting Deal", color: "#ff3355", baseHp: 14, contact: 30, score: 45, coins: 4, touchKill: true,
      spawn(e) {
        e.r = 12 * TD.Screen.unit; e.spin = M.rand(-2, 2); e.armed = false; e.blink = 0;
        const a = M.rand(0, M.TAU), sp = M.rand(10, 30) * TD.Screen.unit;
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
      },
      update(e, game, dt) {
        const d = dToShip(e, game);
        e.ang += e.spin * dt; e.blink += dt;
        if (d.d < 170 * TD.Screen.unit) {
          e.armed = true;
          steer(e, d.ang, 340 * TD.Screen.unit, dt, 230 * TD.Screen.unit);
        }
      },
      die(e, game) {
        // explode into a ring of shrapnel
        const n = 8;
        for (let i = 0; i < n; i++) enemyShot(game, e.x, e.y, i / n * M.TAU, 170, 8, "#ff7a90", 4);
        game.shake(5);
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        const on = e.armed ? (Math.sin(e.blink * 22) > 0) : (Math.sin(e.blink * 4) > 0);
        const c = e.armed && on ? "#fff" : e.color;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.6, 0, M.TAU);
        neon(ctx, c, on ? "rgba(255,51,85,.4)" : "rgba(255,51,85,.12)", 2.4);
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * M.TAU;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * e.r * 0.6, Math.sin(a) * e.r * 0.6);
          ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
          ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.stroke();
        }
      },
    },

    /* Knock-off Drone — fast sine-weaving swarmling */
    weaver: {
      name: "Knock-off Drone", color: "#7af06a", baseHp: 7, contact: 10, score: 18, coins: 1,
      spawn(e) {
        e.r = 8 * TD.Screen.unit; e.t = M.rand(0, 6); e.heading = M.rand(0, M.TAU);
      },
      update(e, game, dt) {
        const d = dToShip(e, game);
        e.t += dt * 6;
        e.heading = M.lerp(e.heading, d.ang, 0.04);
        const wob = e.heading + Math.sin(e.t) * 0.9;
        steer(e, wob, 360 * TD.Screen.unit, dt, 175 * TD.Screen.unit);
        e.ang = Math.atan2(e.vy, e.vx);
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        ctx.beginPath();
        ctx.moveTo(e.r, 0); ctx.lineTo(-e.r * 0.7, e.r * 0.7); ctx.lineTo(-e.r * 0.7, -e.r * 0.7);
        ctx.closePath();
        neon(ctx, e.color, "rgba(122,240,106,.2)", 2);
      },
    },

    /* ===== BOSS — Premium Seller is now the Wyrm's head (see `serpent`) ===== */

    /* ===== BOSS — Markdown Mamba 🐍 (the Wyrm) ===== */
    serpent: {
      name: "Markdown Mamba", color: "#37f0a6", baseHp: 1700, contact: 24, score: 2200, coins: 110, isBoss: true,
      banner: ["🐍 MARKDOWN MAMBA", "Coiled for clearance. Segmented for bulk savings."],
      spawn(e) {
        const u = TD.Screen.unit;
        e.r = 30 * u;
        e.ang = M.rand(0, M.TAU); e.t = 0; e.fire = 2; e.phase = 0; e.ring = 0; e.atkTimer = 2.4; e.minionT = 5;
        const N = 28;            // longer wyrm
        e.seg = [];
        for (let i = 0; i < N; i++) {
          // uniform thickness for most of the length, tapering only the last few segments
          const taper = i < N - 7 ? 1 : Math.max(0.32, 1 - (i - (N - 7)) / 7 * 0.7);
          e.seg.push({ x: e.x, y: e.y, r: 15 * u * taper });
        }
        e.parts = e.seg;        // collision circles (used by game.hitEnemy)
        initChain(e, 12 * u);   // lay the body out behind the head
      },
      update(e, game, dt) {
        const u = TD.Screen.unit, W = TD.Screen.W, H = TD.Screen.H;
        const d = dToShip(e, game);
        e.t += dt;
        // chase the player, weave, and curl back toward centre near the edges
        let desired = d.ang + Math.sin(e.t * 2.2) * 0.95;   // pronounced head oscillation → sinusoidal body
        const m = 70 * u;
        if (e.x < m || e.x > W - m || e.y < m || e.y > H - m)
          desired = Math.atan2(H / 2 - e.y, W / 2 - e.x);
        e.ang = M.angToward(e.ang, desired, 2.6 * dt);
        const sp = 135 * u;
        e.vx = Math.cos(e.ang) * sp; e.vy = Math.sin(e.ang) * sp;
        // body flows behind the head (follow-the-leader; pure turns don't swing the tail)
        followChain(e, 12 * u, dt);
        e.phase = (e.hp / e.maxHp) < 0.35 ? 2 : (e.hp / e.maxHp) < 0.7 ? 1 : 0;
        e.ring += dt;
        // tail venom — constant pressure from the back of the wyrm
        e.fire -= dt;
        if (e.fire <= 0) {
          e.fire = e.phase ? 1.3 : 2.0;
          const tail = e.seg[e.seg.length - 1];
          for (let k = -1; k <= 1; k++) enemyShot(game, tail.x, tail.y, d.ang + k * 0.25, 220, 10, "#aaffdd", 5);
        }
        // Premium Seller signature attacks fire from the head
        e.atkTimer -= dt;
        if (e.atkTimer <= 0) {
          const roll = Math.random();
          if (roll < 0.4) {
            const n = 14 + e.phase * 6, off = M.rand(0, 1);
            for (let i = 0; i < n; i++) enemyShot(game, e.x, e.y, (i / n + off) * M.TAU, 150 + e.phase * 20, 11, "#ffe27a", 6);
            game.shake(6); e.atkTimer = 2.6 - e.phase * 0.4;
          } else if (roll < 0.75) {
            for (let i = -3; i <= 3; i++) enemyShot(game, e.x, e.y, d.ang + i * 0.12, 320, 12, "#ff9d4d", 6);
            e.atkTimer = 1.9 - e.phase * 0.3;
          } else {
            e.spiral = 10 + e.phase * 6; e.spiralA = M.rand(0, M.TAU); e.atkTimer = 3 - e.phase * 0.4;
          }
        }
        if (e.spiral > 0) {
          e.spiralStep = (e.spiralStep || 0) + dt;
          if (e.spiralStep > 0.06) {
            e.spiralStep = 0;
            enemyShot(game, e.x, e.y, e.spiralA, 200, 10, "#ffd23b", 5);
            enemyShot(game, e.x, e.y, e.spiralA + Math.PI, 200, 10, "#ffd23b", 5);
            e.spiralA += 0.5; e.spiral--;
          }
        }
        // restock minions
        e.minionT -= dt;
        if (e.minionT <= 0 && game.enemies.length < 26) {
          e.minionT = 6 - e.phase;
          const types = e.phase >= 1 ? ["seeker", "weaver", "weaver"] : ["weaver", "weaver"];
          for (const tp of types) { const a = M.rand(0, M.TAU); game.spawnEnemy(tp, e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, { hpScale: e.hpScale }); }
          game.toast("⭐ Premium Seller restocked minions!", "bad");
        }
      },
      die(e, game) {
        for (let i = 0; i < e.seg.length; i += 2) {
          const s = e.seg[i];
          game.addPop(s.x, s.y, s.r * 3, "#37f0a6", { fill: "#ffffff", w: 3, life: 0.4 });
          game.explode(s.x, s.y, "#37f0a6", s.r);
        }
      },
      draw(e, ctx) {
        // green body segments hold WORLD coords; ctx is translated to the head (e.x,e.y)
        for (let i = e.seg.length - 1; i >= 1; i--) {
          const s = e.seg[i], x = s.x - e.x, y = s.y - e.y;
          ctx.beginPath(); ctx.arc(x, y, s.r, 0, M.TAU);
          ctx.fillStyle = "rgba(18,70,54,.55)";
          ctx.strokeStyle = (e.phase && i % 2 === 0) ? "#bdffe6" : e.color; ctx.lineWidth = 2.4;
          ctx.shadowColor = e.color; ctx.shadowBlur = 10; ctx.fill(); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        // HEAD — snake head: spiked crown + faceted skull with a green overtone
        const r = e.r * 1.5;
        ctx.save(); ctx.rotate(e.ring * 0.6);
        for (let i = 0; i < 5; i++) {
          ctx.save(); ctx.rotate(i / 5 * M.TAU);
          ctx.beginPath(); ctx.moveTo(r * 1.05, 0); ctx.lineTo(r * 1.35, r * 0.12); ctx.lineTo(r * 1.35, -r * 0.12);
          ctx.closePath(); ctx.fillStyle = "#ffe27a"; ctx.shadowColor = "#ffd23b"; ctx.shadowBlur = 16; ctx.fill();
          ctx.restore();
        }
        ctx.restore(); ctx.shadowBlur = 0;
        ctx.save(); ctx.rotate(e.ang);
        poly(ctx, 10, r, 0);
        neon(ctx, e.phase === 2 ? "#ff5a4d" : "#ffd23b", "rgba(100,255,255,.14)", 4);
        poly(ctx, 5, r * 0.6, e.ring);
        neon(ctx, "#fff3c4", "rgba(100,210,59,.25)", 3);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, M.TAU);
        neon(ctx, "#fff", "rgba(40,190,77,.4)", 2);
        ctx.restore();
      },
    },

    /* ===== BOSS — Doorbuster Bull 🐂 (slow-turning charger) ===== */
    rammer: {
      name: "Doorbuster Bull", color: "#ff6a2b", baseHp: 1500, contact: 34, score: 1750, coins: 88, isBoss: true,
      banner: ["🐂 DOORBUSTER BULL", "Charges hard. Corners terribly."],
      spawn(e) {
        e.r = 32 * TD.Screen.unit;
        e.mode = "aim"; e.ang = M.rand(0, M.TAU); e.timer = 1.4; e.fire = 0; e.glow = 0; e.phase = 0;
      },
      update(e, game, dt) {
        const u = TD.Screen.unit, W = TD.Screen.W, H = TD.Screen.H;
        const d = dToShip(e, game);
        e.phase = (e.hp / e.maxHp) < 0.4 ? 2 : (e.hp / e.maxHp) < 0.7 ? 1 : 0;
        if (e.mode === "aim") {
          e.vx *= 0.86; e.vy *= 0.86;
          // turn slowly toward a charge target clamped inside the arena
          const ca = chargeAng(e, game, 70);
          e.ang = M.angToward(e.ang, ca, (1.0 + e.phase * 0.15) * dt);
          e.glow = Math.min(1, e.glow + dt * 1.5);
          // periodic fire spray out the BACK while turning
          e.fire -= dt;
          if (e.fire <= 0) {
            e.fire = 0.26 - e.phase * 0.03;
            const back = e.ang + Math.PI;
            const bx = e.x + Math.cos(back) * e.r, by = e.y + Math.sin(back) * e.r;
            for (let k = -2; k <= 2; k++)
              enemyShot(game, bx, by, back + k * 0.16 + M.rand(-0.05, 0.05), 210, 10, "#ffb24d", 6);
          }
          e.timer -= dt;
          // aligned + wound up -> WINDUP (1s red-eye tell) -> charge
          if (e.timer <= 0 && Math.abs(M.angDiff(e.ang, ca)) < 0.14) {
            e.mode = "windup"; e.windup = 1.0; e.chargeAng = ca; e.glow = 1; game.shake(4);
          }
        } else if (e.mode === "windup") {
          // telegraph for a full second (eyes glow red), still tracking, then commit to the charge
          e.vx *= 0.86; e.vy *= 0.86;
          e.chargeAng = chargeAng(e, game, 70);
          e.ang = M.angToward(e.ang, e.chargeAng, 1.5 * dt);
          e.glow = 1;
          e.windup -= dt;
          if (e.windup <= 0) { e.mode = "charge"; e.chargeT = 1.0 + e.phase * 0.25; game.shake(5); }
        } else if (e.mode === "charge") {
          steer(e, e.chargeAng, 1100 * u, dt, (520 + e.phase * 70) * u);
          e.ang = e.chargeAng;
          e.chargeT -= dt;
          const m = e.r, hitWall = e.x < m || e.x > W - m || e.y < m || e.y > H - m;
          if (e.chargeT <= 0 || hitWall) {
            e.mode = "recover"; e.timer = 0.5; e.glow = 0;
            if (hitWall) { game.shake(8); game.addPop(e.x, e.y, e.r * 3, "#ffb24d", { w: 4 }); }
          }
        } else { // recover
          e.vx *= 0.8; e.vy *= 0.8;
          e.timer -= dt;
          if (e.timer <= 0) { e.mode = "aim"; e.timer = 0.5 + M.rand(0, 0.5); e.fire = 0; e.glow = 0; }
        }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        const charging = e.mode === "charge";
        if (e.mode === "aim" && e.glow > 0.2) {
          ctx.beginPath();
          ctx.moveTo(-e.r * 0.8, e.r * 0.5); ctx.lineTo(-e.r * (1.3 + e.glow * 0.7), 0); ctx.lineTo(-e.r * 0.8, -e.r * 0.5);
          ctx.closePath(); ctx.fillStyle = "rgba(255,160,60,.5)"; ctx.shadowColor = "#ffb24d"; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.moveTo(e.r * 1.25, 0); ctx.lineTo(-e.r * 0.7, e.r); ctx.lineTo(-e.r * 0.83, 0); ctx.lineTo(-e.r * 0.7, -e.r);
        ctx.closePath();
        neon(ctx, charging ? "#ffd14d" : e.color, charging ? "rgba(255,209,77,.25)" : "rgba(255,106,43,.16)", charging ? 4 : 3);
        // --- horns (mirrored pair; tweak these knobs to move/spread them) ---
        ctx.strokeStyle = "#fff0c2"; ctx.lineWidth = 3; ctx.shadowColor = "#ffd14d"; ctx.shadowBlur = charging ? 12 : 6;
        const hBaseX = e.r * 0.0;    // base along the body — smaller = further back (eyes sit at 0.5)
        const hBaseY = e.r * 0.5;    // base spread — bigger = farther apart
        const hTipX  = e.r * 0.85;   // tip reach (positive = tips curve FORWARD toward the nose)
        const hTipY  = e.r * 0.7;    // tip spread (less than the bow below → tips hook inward at the nose)
        ctx.beginPath();
        for (const s of [-1, 1]) {
          ctx.moveTo(hBaseX, s * hBaseY);
          ctx.quadraticCurveTo(hBaseX + e.r * 0.25, s * (hBaseY + e.r * 0.55), hTipX, s * hTipY);
        }
        ctx.stroke(); ctx.shadowBlur = 0;
        // eyes — glow red through the windup tell and the charge, yellow otherwise
        const telegraph = e.mode === "windup" || e.mode === "charge";
        ctx.fillStyle = telegraph ? "#ff2d2d" : "#ffd14d";
        ctx.shadowColor = "#ff2d2d"; ctx.shadowBlur = telegraph ? 12 : 0;
        ctx.beginPath(); ctx.arc(e.r * 0.5, 9.5, e.r * 0.1, 0, M.TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(e.r * 0.5, -9.5, e.r * 0.1, 0, M.TAU); ctx.fill();
        ctx.shadowBlur = 0;
      },
    },

    /* ===================== MINIBOSSES (every 5 levels) =====================
       Tougher than mobs, weaker than bosses. No prize wheel — they pay out a
       MASSIVE pile of coins instead. Flagged isMini (treated as a "big unit":
       full speed, stays on-screen, HP bar, draws once). */

    /* 1 — Twin Tumbler: two heavy orbs whirling on a tether */
    bolas: {
      name: "Twin Tumbler", color: "#ff9d2b", baseHp: 240, contact: 22, score: 360, coins: 80, isMini: true,
      banner: ["🔗 TWIN TUMBLER", "Two orbs. One bad day."],
      spawn(e) { const u = TD.Screen.unit; e.r = 12 * u; e.t = 0; e.spin = 2.4; e.arm = 46 * u; e.orb = 16 * u;
        e.parts = [{ x: e.x, y: e.y, r: e.orb }, { x: e.x, y: e.y, r: e.orb }]; },
      update(e, game, dt) { const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        steer(e, d.ang, 70 * u, dt, 78 * u);
        const a = e.t * e.spin;
        e.parts[0].x = e.x + Math.cos(a) * e.arm; e.parts[0].y = e.y + Math.sin(a) * e.arm;
        e.parts[1].x = e.x - Math.cos(a) * e.arm; e.parts[1].y = e.y - Math.sin(a) * e.arm; e.ang = a; },
      draw(e, ctx) { const p = e.parts;
        ctx.strokeStyle = "rgba(255,157,43,.5)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(p[0].x - e.x, p[0].y - e.y); ctx.lineTo(p[1].x - e.x, p[1].y - e.y); ctx.stroke();
        for (const o of p) { ctx.beginPath(); ctx.arc(o.x - e.x, o.y - e.y, o.r, 0, M.TAU);
          neon(ctx, "#ffd14d", "rgba(255,157,43,.25)", 3); }
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, M.TAU); neon(ctx, e.color, "rgba(255,157,43,.3)", 2); },
    },

    /* 2 — Discount Disco Ball: slow float, ceaseless rotating laser-spiral */
    disco: {
      name: "Discount Disco Ball", color: "#c46bff", baseHp: 300, contact: 16, score: 420, coins: 90, isMini: true,
      banner: ["🪩 DISCOUNT DISCO BALL", "Now with 50% more lasers."],
      spawn(e) { const u = TD.Screen.unit; e.r = 22 * u; e.a = 0; e.fire = 0;
        const aa = M.rand(0, M.TAU), sp = 30 * u; e.vx = Math.cos(aa) * sp; e.vy = Math.sin(aa) * sp; },
      update(e, game, dt) { e.a += dt * 1.4; e.fire -= dt;
        if (e.fire <= 0) { e.fire = 0.16; const arms = 3;
          for (let k = 0; k < arms; k++) enemyShot(game, e.x, e.y, e.a + k / arms * M.TAU, 150, 9, "#e0a0ff", 6); } },
      draw(e, ctx) { ctx.rotate(e.a);
        poly(ctx, 8, e.r, 0); neon(ctx, e.color, "rgba(196,107,255,.18)", 3);
        for (let i = 0; i < 4; i++) { ctx.rotate(M.TAU / 8); ctx.beginPath(); ctx.moveTo(-e.r, 0); ctx.lineTo(e.r, 0);
          ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1.4; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.5, 0, M.TAU); neon(ctx, "#fff", "rgba(196,107,255,.3)", 2); },
    },

    /* 3 — Refund Reaper: blinks to flank you, fires aimed scythe-spreads */
    reaper: {
      name: "Refund Reaper", color: "#37f0ff", baseHp: 220, contact: 20, score: 440, coins: 85, isMini: true,
      banner: ["💀 REFUND REAPER", "Your purchase is being… reclaimed."],
      spawn(e) { const u = TD.Screen.unit; e.r = 16 * u; e.blink = 1.82; },
      update(e, game, dt) { const u = TD.Screen.unit, d = dToShip(e, game);
        e.vx *= 0.92; e.vy *= 0.92; e.blink -= dt;
        if (e.blink <= 0) { e.blink = 2.52;   // +40% dwell — lingers between blinks
          game.addPop(e.x, e.y, e.r * 3, "#37f0ff", { w: 3, life: 0.25 });
          const aa = M.rand(0, M.TAU), dist = 200 * u;
          e.x = game.ship.x + Math.cos(aa) * dist; e.y = game.ship.y + Math.sin(aa) * dist;
          const d2 = dToShip(e, game);
          game.addPop(e.x, e.y, e.r * 3, "#37f0ff", { w: 3, life: 0.25 });
          for (let k = -2; k <= 2; k++) enemyShot(game, e.x, e.y, d2.ang + k * 0.16, 300, 11, "#a0f5ff", 6);
        }
        e.ang = d.ang; },
      draw(e, ctx) { ctx.rotate(e.ang); poly(ctx, 4, e.r, 0); neon(ctx, e.color, "rgba(55,240,255,.15)", 2.6);
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.4, 0, M.TAU); neon(ctx, "#dffaff", "rgba(55,240,255,.3)", 2); },
    },

    /* 4 — Clearance Crusher: slow juggernaut with a frontal plow + ground-slam */
    crusher: {
      name: "Clearance Crusher", color: "#ff5a3c", baseHp: 430, contact: 26, score: 480, coins: 95, isMini: true,
      banner: ["🧱 CLEARANCE CRUSHER", "Heavy. Slow. Unbothered."],
      spawn(e) { const u = TD.Screen.unit; e.r = 28 * u; e.slam = 2.6; e.face = 0; },
      update(e, game, dt) { const u = TD.Screen.unit, d = dToShip(e, game);
        e.face = M.angToward(e.face, d.ang, 1.0 * dt); e.ang = e.face;
        steer(e, d.ang, 42 * u, dt, 44 * u); e.slam -= dt;
        if (e.slam <= 0 && d.d < 270 * u) { e.slam = 3.0;
          const n = 18; for (let i = 0; i < n; i++) enemyShot(game, e.x, e.y, i / n * M.TAU, 150, 11, "#ff8a5a", 6);
          game.shake(7); game.addPop(e.x, e.y, e.r * 3, "#ff8a5a", { w: 4 }); } },
      draw(e, ctx) { ctx.rotate(e.ang); poly(ctx, 6, e.r, 0); neon(ctx, e.color, "rgba(255,90,60,.16)", 3.4);
        // armored front arc — threatening RED neon shield (big glow + bright core)
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.95, -0.9, 0.9); ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 10;
        ctx.shadowColor = "#ff1020"; ctx.shadowBlur = 32; ctx.stroke(); ctx.shadowBlur = 18; ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.lineCap = "butt"; },
    },

    /* 5 — Knockoff Hydra: periodically spits out swarms of mobs */
    hydra: {
      name: "Knockoff Hydra", color: "#7af06a", baseHp: 240, contact: 18, score: 500, coins: 90, isMini: true,
      banner: ["🐉 KNOCKOFF HYDRA", "Cut one deal, two more appear."],
      spawn(e) { const u = TD.Screen.unit; e.r = 22 * u; e.spawnT = 2.0; e.t = 0; },
      update(e, game, dt) { const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        steer(e, d.ang, 40 * u, dt, 48 * u); e.spawnT -= dt;
        if (e.spawnT <= 0) { e.spawnT = 3.2;
          let alive = 0; for (const x of game.enemies) if (!x.dead && x.hydra === e) alive++;  // cap this Hydra's minions at 5
          const room = Math.min(2, 5 - alive);
          for (let i = 0; i < room && game.enemies.length < 28; i++) { const a = M.rand(0, M.TAU);
            const m = game.spawnEnemy(M.chance(0.5) ? "seeker" : "weaver", e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, { hpScale: e.hpScale * 0.7 });
            m.hp = 1; m.maxHp = 1; m.color = "#7af06a"; m.hydra = e; }   // Hydra minions: glass (1 HP) + green
          if (room > 0) game.toast("🐉 Hydra spat out minions!", "bad"); } },
      draw(e, ctx) { const pls = 1 + Math.sin(e.t * 4) * 0.05; ctx.scale(pls, pls);
        poly(ctx, 7, e.r, e.t * 0.5); neon(ctx, e.color, "rgba(122,240,106,.18)", 3);
        for (let i = 0; i < 3; i++) { const a = e.t + i / 3 * M.TAU;
          ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.5, Math.sin(a) * e.r * 0.5, e.r * 0.2, 0, M.TAU);
          neon(ctx, "#cfffc4", "rgba(122,240,106,.3)", 1.6); } },
    },

    /* 6 — Bargain Bomber: strafes and litters proximity mines */
    bomber: {
      name: "Bargain Bomber", color: "#ff3355", baseHp: 260, contact: 18, score: 460, coins: 88, isMini: true,
      banner: ["💣 BARGAIN BOMBER", "Free explosive samples!"],
      spawn(e) { const u = TD.Screen.unit; e.r = 20 * u; e.drop = 1.4;
        const a = M.rand(0, M.TAU), sp = 80 * u; e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp; },
      update(e, game, dt) { const u = TD.Screen.unit, d = dToShip(e, game);
        steer(e, d.ang + Math.PI / 2, 34 * u, dt, 95 * u); e.drop -= dt;
        if (e.drop <= 0 && game.enemies.length < 30) { e.drop = 1.5;
          game.spawnEnemy("mine", e.x, e.y, { hpScale: e.hpScale * 0.8 }); }
        e.ang = Math.atan2(e.vy, e.vx); },
      draw(e, ctx) { ctx.rotate(e.ang); poly(ctx, 3, e.r, 0); neon(ctx, e.color, "rgba(255,51,85,.16)", 2.6);
        ctx.beginPath(); ctx.arc(-e.r * 0.3, 0, e.r * 0.35, 0, M.TAU); neon(ctx, "#ffd0d8", "rgba(255,51,85,.3)", 2); },
    },

    /* 7 — Static Sphere: winds up an orbiting bullet-ring, then flings it out */
    ringcharger: {
      name: "Static Sphere", color: "#ffd23b", baseHp: 280, contact: 18, score: 470, coins: 90, isMini: true,
      banner: ["🌐 STATIC SPHERE", "Charging… please wait."],
      spawn(e) { const u = TD.Screen.unit; e.r = 20 * u; e.t = 0; e.charge = 2.2; e.ringN = 16; e.ringR = 48 * u; },
      update(e, game, dt) { const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        steer(e, d.ang, 30 * u, dt, 40 * u); e.charge -= dt;
        if (e.charge <= 0) { e.charge = 2.6; const off = M.rand(0, 1);
          for (let i = 0; i < e.ringN; i++) enemyShot(game, e.x, e.y, (i / e.ringN + off) * M.TAU, 240, 10, "#ffe27a", 6);
          game.addPop(e.x, e.y, e.ringR, "#ffe27a", { w: 3 }); } },
      draw(e, ctx) { const grow = 1 - Math.max(0, e.charge) / 2.6;
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, M.TAU); neon(ctx, e.color, "rgba(255,210,59,.2)", 3);
        const rr = e.ringR * (1.12 - 0.32 * grow);
        for (let i = 0; i < e.ringN; i++) { const a = e.t * 1.5 + i / e.ringN * M.TAU;
          ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 3, 0, M.TAU);
          ctx.fillStyle = "#ffe27a"; ctx.shadowColor = "#ffd23b"; ctx.shadowBlur = 8; ctx.fill(); } ctx.shadowBlur = 0; },
    },

    /* 8 — Markdown Mech: slow-rotating turret, alternating twin-barrel bursts */
    turret: {
      name: "Markdown Mech", color: "#37b6ff", baseHp: 340, contact: 20, score: 500, coins: 92, isMini: true,
      banner: ["🤖 MARKDOWN MECH", "Two barrels. Zero chill."],
      spawn(e) { const u = TD.Screen.unit; e.r = 22 * u; e.face = 0; e.fire = 1.2; e.side = 1; },
      update(e, game, dt) { const u = TD.Screen.unit, d = dToShip(e, game);
        e.face = M.angToward(e.face, d.ang, 1.6 * dt); e.ang = e.face;
        steer(e, d.ang, 26 * u, dt, 34 * u); e.fire -= dt;
        if (e.fire <= 0) { e.fire = 0.5; e.side *= -1;
          const perp = e.face + Math.PI / 2, off = e.side * e.r * 0.6;
          const bx = e.x + Math.cos(perp) * off, by = e.y + Math.sin(perp) * off;
          for (let k = -1; k <= 1; k++) enemyShot(game, bx, by, e.face + k * 0.08, 320, 11, "#9fdcff", 6); } },
      draw(e, ctx) { ctx.rotate(e.ang); poly(ctx, 6, e.r, 0); neon(ctx, e.color, "rgba(55,182,255,.16)", 3);
        for (const s of [-1, 1]) { ctx.save(); ctx.translate(0, s * e.r * 0.6);
          ctx.fillStyle = "#cfeeff"; ctx.shadowColor = "#37b6ff"; ctx.shadowBlur = 6;
          ctx.fillRect(e.r * 0.3, -2.5, e.r * 0.9, 5); ctx.restore(); } ctx.shadowBlur = 0; },
    },

    /* 9 — Glitch Cube: waits, then dashes in glitchy bursts leaving slow shards */
    dasher: {
      name: "Glitch Cube", color: "#ff5edb", baseHp: 260, contact: 22, score: 480, coins: 86, isMini: true,
      banner: ["🟪 GLITCH CUBE", "Err… err… error… ERROR."],
      spawn(e) { const u = TD.Screen.unit; e.r = 18 * u; e.mode = "wait"; e.timer = 0.8; e.t = 0; e.da = 0; },
      update(e, game, dt) { const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt; e.timer -= dt;
        if (e.mode === "wait") { e.vx *= 0.8; e.vy *= 0.8;
          if (e.timer <= 0) { e.mode = "dash"; e.timer = 0.45; e.da = d.ang + M.rand(-0.5, 0.5); } }
        else { steer(e, e.da, 1000 * u, dt, 470 * u);
          if (Math.random() < 0.6) enemyShot(game, e.x, e.y, Math.atan2(-e.vy, -e.vx), 70, 9, "#ffa0ec", 6);
          if (e.timer <= 0) { e.mode = "wait"; e.timer = 0.5 + M.rand(0, 0.4); game.addPop(e.x, e.y, e.r * 2.5, "#ff5edb", { w: 3, life: 0.2 }); } }
        e.ang = e.t * 3; },
      draw(e, ctx) { ctx.rotate(e.ang); const dash = e.mode === "dash"; const s = e.r * 0.8;
        ctx.beginPath(); ctx.rect(-s, -s, s * 2, s * 2); neon(ctx, dash ? "#ffd1f4" : e.color, "rgba(255,94,219,.18)", dash ? 4 : 2.6); },
    },

    /* 10 — Voucher Vortex: drags you in with gravity while spitting slow spirals */
    vortex: {
      name: "Voucher Vortex", color: "#9d6bff", baseHp: 320, contact: 16, score: 520, coins: 100, isMini: true,
      banner: ["🌪 VOUCHER VORTEX", "Deals so good they're inescapable."],
      spawn(e) { const u = TD.Screen.unit; e.r = 20 * u; e.a = 0; e.fire = 0; },
      update(e, game, dt) { e.a += dt * 1.2;
        const s = game.ship, dx = e.x - s.x, dy = e.y - s.y, dd = Math.hypot(dx, dy) || 1;
        const pull = Math.min(470, 42000 / dd); // accel px/s², stronger up close, capped
        s.vx += dx / dd * pull * dt; s.vy += dy / dd * pull * dt;
        e.fire -= dt;
        if (e.fire <= 0) { e.fire = 0.18; for (let k = 0; k < 2; k++) enemyShot(game, e.x, e.y, e.a + k * Math.PI, 120, 9, "#c7a8ff", 6); } },
      draw(e, ctx) { ctx.rotate(e.a);
        for (let i = 0; i < 3; i++) { const rr = e.r * (1 - i * 0.25);
          ctx.beginPath(); ctx.arc(0, 0, rr, i, i + 4); ctx.strokeStyle = i ? "rgba(157,107,255,.5)" : "#d9c4ff";
          ctx.lineWidth = 3; ctx.shadowColor = "#9d6bff"; ctx.shadowBlur = 10; ctx.stroke(); } ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.3, 0, M.TAU); ctx.fillStyle = "#1a1030"; ctx.fill(); },
    },

    /* ================= ZODIAC BOSSES ================= */

    /* 🐀 RAT — Clearance Rat King: skitters, lays mines, spews rat-swarms */
    z_rat: {
      name: "Clearance Rat King", color: "#b9c4d0", baseHp: 1100, contact: 22, score: 1700, coins: 85, isBoss: true,
      banner: ["🐀 CLEARANCE RAT KING", "Infests the warehouse. Brings friends."],
      spawn(e) { const u = TD.Screen.unit; e.r = 26 * u; e.t = 0; e.dart = 0; e.litter = 1.6; e.swarm = 3; e.tail = 0; },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt; e.tail += dt * 9;
        e.dart -= dt;
        if (e.dart <= 0) { e.dart = M.rand(0.5, 1.0); e.da = approachAng(e, game.ship.x, game.ship.y) + M.rand(-1.0, 1.0); }
        steer(e, e.da, 540 * u, dt, 250 * u); e.vx *= 0.93; e.vy *= 0.93;
        e.ang = Math.atan2(e.vy, e.vx);
        e.litter -= dt;
        if (e.litter <= 0 && game.enemies.length < 30) { e.litter = M.rand(1.0, 1.8); game.spawnEnemy("mine", e.x, e.y, { hpScale: e.hpScale * 0.7 }); }
        e.swarm -= dt;
        if (e.swarm <= 0 && game.enemies.length < 28) { e.swarm = 4.5;
          for (let i = 0; i < 4; i++) { const a = M.rand(0, M.TAU); game.spawnEnemy("weaver", e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, { hpScale: e.hpScale * 0.6 }); }
          game.toast("🐀 The Rat King summons vermin!", "bad"); }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        // tail
        ctx.beginPath(); ctx.moveTo(-e.r * 0.7, 0);
        for (let i = 1; i <= 5; i++) ctx.lineTo(-e.r * (0.7 + i * 0.32), Math.sin(e.tail + i) * e.r * 0.18);
        ctx.strokeStyle = "#ff5a7a"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.shadowColor = "#ff5a7a"; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0; ctx.lineCap = "butt";
        poly(ctx, 7, e.r, 0); neon(ctx, e.color, "rgba(185,196,208,.16)", 3);
        // ears
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(e.r * 0.5, s * e.r * 0.7, e.r * 0.34, 0, M.TAU); neon(ctx, e.color, "rgba(185,196,208,.2)", 2); }
        ctx.beginPath(); ctx.arc(e.r * 0.7, 0, e.r * 0.13, 0, M.TAU); ctx.fillStyle = "#ff5a7a"; ctx.fill();
      },
    },

    /* 🐅 TIGER — Counterfeit Tiger: stalk + pounce with claw-cone slashes */
    z_tiger: {
      name: "Counterfeit Tiger", color: "#ff9415", baseHp: 1300, contact: 30, score: 1850, coins: 90, isBoss: true,
      banner: ["🐅 COUNTERFEIT TIGER", "Pounces. Slashes. Voids warranty."],
      spawn(e) { const u = TD.Screen.unit; e.r = 30 * u; e.mode = "stalk"; e.timer = 1.2; e.face = 0; e.t = 0; },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        if (e.mode === "stalk") {
          // circle-strafe the player, build to a pounce
          e.face = M.angToward(e.face, d.ang, 3 * dt);
          steer(e, approachAng(e, game.ship.x, game.ship.y) + Math.PI / 2 * (e.t % 4 < 2 ? 1 : -1), 220 * u, dt, 150 * u);
          e.timer -= dt;
          if (e.timer <= 0) { e.mode = "crouch"; e.timer = 0.4; e.vx *= 0.3; e.vy *= 0.3; }
        } else if (e.mode === "crouch") {
          e.face = M.angToward(e.face, chargeAng(e, game, 60), 5 * dt); e.vx *= 0.8; e.vy *= 0.8;
          e.timer -= dt; if (e.timer <= 0) { e.mode = "pounce"; e.pa = e.face; e.timer = 0.55; }
        } else { // pounce
          steer(e, e.pa, 1200 * u, dt, 620 * u); e.face = e.pa; e.timer -= dt;
          if (Math.random() < 0.5) for (const k of [-1, 1]) enemyShot(game, e.x, e.y, e.pa + k * 0.5, 260, 12, "#ffd07a", 6);
          if (e.timer <= 0) { e.mode = "stalk"; e.timer = M.rand(1.2, 2.0); e.pounces = (e.pounces || 0) + 1; }
        }
        e.ang = e.face;
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        const crouch = e.mode === "crouch", pounce = e.mode === "pounce";
        const R = e.r * (crouch ? 0.85 : 1);
        const oc = pounce ? "#ffe0a0" : "#ffab33";   // bright-orange body outline
        // 1) body fill (backdrop for the stripes)
        poly(ctx, 4, R, 0); ctx.fillStyle = "rgba(255,138,20,.20)"; ctx.fill();
        // 2) fat orange tiger stripes — horizontal bands spanning the body
        ctx.strokeStyle = "#c25600"; ctx.lineCap = "round"; ctx.lineWidth = e.r * 0.17;
        for (const fy of [-0.55, -0.2, 0.2, 0.55]) {
          const y = fy * R, halfW = Math.max(0, (R - Math.abs(y)) * 0.82);
          ctx.beginPath(); ctx.moveTo(-halfW, y); ctx.lineTo(halfW, y); ctx.stroke();
        }
        ctx.lineCap = "butt";
        // 3) bright-orange body outline ON TOP of the stripes
        poly(ctx, 4, R, 0);
        ctx.lineWidth = 4.2; ctx.strokeStyle = oc; ctx.shadowColor = oc; ctx.shadowBlur = 16; ctx.stroke();
        ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.stroke();
        // 4) eyes
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(e.r * 0.55, s * e.r * 0.25, e.r * 0.1, 0, M.TAU); ctx.fillStyle = "#fff"; ctx.fill(); }
      },
    },

    /* 🐇 RABBIT — Lucky Rabbit (Refurb): hop-teleports, rings on landing */
    z_rabbit: {
      name: "Lucky Rabbit (Refurb)", color: "#ff8fd0", baseHp: 1050, contact: 22, score: 1700, coins: 88, isBoss: true,
      banner: ["🐇 LUCKY RABBIT (REFURB)", "Hops the queue. Drops moon-bombs."],
      spawn(e) { const u = TD.Screen.unit; e.r = 24 * u; e.hop = 1.82; e.t = 0; e.squash = 0; },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        e.vx *= 0.9; e.vy *= 0.9; e.hop -= dt; if (e.squash > 0) e.squash -= dt;
        if (e.hop <= 0) {
          e.hop = M.rand(1.4, 2.1); e.squash = 0.18;   // +40% dwell — stays put longer between hops
          // landing ring + a moon-bomb mine, then teleport-hop to a flanking spot
          const n = 12 + (((e.maxHp - e.hp) / e.maxHp) > 0.5 ? 6 : 0), off = M.rand(0, 1);
          for (let i = 0; i < n; i++) enemyShot(game, e.x, e.y, (i / n + off) * M.TAU, 170, 11, "#ffc0e8", 6);
          game.addPop(e.x, e.y, e.r * 2.6, "#ff8fd0", { w: 3 });
          const aa = M.rand(0, M.TAU), dist = 230 * u;
          e.x = game.ship.x + Math.cos(aa) * dist; e.y = game.ship.y + Math.sin(aa) * dist;
          game.addPop(e.x, e.y, e.r * 2, "#ff8fd0", { w: 3, life: 0.2 });
          if (game.enemies.length < 26) game.spawnEnemy("mine", e.x, e.y, { hpScale: e.hpScale * 0.7 });
        }
        e.ang = d.ang;
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        const sq = e.squash > 0 ? 1.3 : 1, sy = e.squash > 0 ? 0.7 : 1;
        ctx.save(); ctx.scale(sq, sy);
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, M.TAU); neon(ctx, e.color, "rgba(255,143,208,.18)", 3);
        ctx.restore();
        // long ears
        for (const s of [-1, 1]) { ctx.save(); ctx.translate(e.r * 0.2, s * e.r * 0.4); ctx.rotate(s * 0.5);
          ctx.beginPath(); ctx.ellipse(e.r * 0.3, 0, e.r * 0.5, e.r * 0.18, 0, 0, M.TAU); neon(ctx, e.color, "rgba(255,143,208,.25)", 2); ctx.restore(); }
        ctx.beginPath(); ctx.arc(e.r * 0.55, 0, e.r * 0.12, 0, M.TAU); ctx.fillStyle = "#fff"; ctx.fill();
      },
    },

    /* 🐉 DRAGON — Dragon-Brand Knockoff: sweeping flame-breath + thunder zones */
    z_dragon: {
      name: "Dragon-Brand Knockoff", color: "#ff3b5c", baseHp: 1600, contact: 32, score: 2400, coins: 120, isBoss: true, severTail: true,
      banner: ["🐉 DRAGON-BRAND KNOCKOFF", "As seen on a cart. Breathes fire."],
      spawn(e) { const u = TD.Screen.unit; const base = 40 * u; e.r = base * 0.5;   // head (+ eyes/horns/whiskers + hitbox) at half size
        e.t = 0; e.breath = 2.5; e.sweep = 0; e.zoneT = 4; e.spiralA = 0;
        e.moveT = M.rand(2.5, 4.5); e.dashing = false; e.dest = null;
        const N = 24; e.seg = [];
        for (let i = 0; i < N; i++) e.seg.push({ x: e.x, y: e.y, r: Math.max(1.2, base * 0.32 * (1 - i / (N + 3))) });
        e.parts = e.seg;   // body collides — its higher contact makes the dragon hit harder than the wyrm
        // space each segment by its own size so the tapering tail stays connected to the very tip
        let prevR = e.r;
        for (const s of e.seg) { s.gap = (prevR + s.r) * 0.7; prevR = s.r; }
        initChain(e);   // lay the tail out behind the head using each segment's gap
      },
      update(e, game, dt) {
        const u = TD.Screen.unit, W = TD.Screen.W, H = TD.Screen.H, d = dToShip(e, game); e.t += dt;
        // occasionally ZIP to a random waypoint (4 corners + center) so the long tail whips out
        e.moveT -= dt;
        if (!e.dashing && e.moveT <= 0) {
          const m = e.r * 1.8;
          const pts = [[m, m], [W - m, m], [m, H - m], [W - m, H - m], [W * 0.5, H * 0.5]];
          const p = pts[M.randInt(0, pts.length - 1)];
          e.dest = { x: p[0], y: p[1] }; e.dashing = true;
        }
        if (e.dashing) {
          const dx = e.dest.x - e.x, dy = e.dest.y - e.y, dd = Math.hypot(dx, dy), da = Math.atan2(dy, dx);
          steer(e, da, 650 * u, dt, 480 * u);                 // fast zip — the tail strings out behind
          e.ang = M.angToward(e.ang, da, 4 * dt);
          if (dd < 45 * u) { e.dashing = false; e.moveT = M.rand(3, 5.5); }
        } else {
          const ideal = 300 * u;
          if (d.d > ideal) steer(e, approachAng(e, game.ship.x, game.ship.y), 60 * u, dt, 85 * u); else steer(e, d.ang + Math.PI, 50 * u, dt, 70 * u);
          e.vx *= 0.97; e.vy *= 0.97; e.ang = M.angToward(e.ang, d.ang, 2.4 * dt);
        }
        const hpF = e.hp / e.maxHp, ph = hpF < 0.35 ? 2 : hpF < 0.7 ? 1 : 0;
        // flame breath: a dense cone that sweeps across the player
        e.breath -= dt;
        if (e.breath <= 0 && e.sweep <= 0) { e.sweep = 1.1; e.sweepA = d.ang - 0.5; e.breath = 3.2 - ph * 0.5; }
        if (e.sweep > 0) {
          e.sweep -= dt; e.sweepA += 1.0 * dt;
          for (let k = 0; k < 2; k++) enemyShot(game, e.x + Math.cos(e.ang) * e.r, e.y + Math.sin(e.ang) * e.r, e.sweepA + k * 0.12, 300, 11, "#ffb24d", 6);
        }
        // thunder warning zones that detonate
        e.zoneT -= dt;
        if (e.zoneT <= 0) { e.zoneT = 2.6 - ph * 0.4; game.telegraphZone(game.ship.x + M.rand(-60, 60), game.ship.y + M.rand(-60, 60), 90 * u, 0.9, 16); }
        // phase-2 spiral
        if (ph >= 1) { e.spiralA += 0.4; if (Math.floor(e.t * 12) % 3 === 0) enemyShot(game, e.x, e.y, e.spiralA, 200, 10, "#ff7a9c", 5); }
        // tail flows behind the head (follow-the-leader; a turn no longer swings it like a weapon)
        followChain(e, e.r * 0.42, dt);
      },
      draw(e, ctx) {
        // segmented tail in WORLD frame (ctx translated to head, not yet rotated) —
        // each segment is a septagon with the same neon outline as the head, aligned to the spine
        for (let i = e.seg.length - 1; i >= 0; i--) {
          const s = e.seg[i], x = s.x - e.x, y = s.y - e.y;
          const prev = i === 0 ? e : e.seg[i - 1];
          const ang = Math.atan2(prev.y - s.y, prev.x - s.x);
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
          poly(ctx, 7, s.r, 0); neon(ctx, e.color, "rgba(255,59,92,.16)", 2);
          ctx.restore();
        }
        ctx.shadowBlur = 0;
        ctx.rotate(e.ang);
        poly(ctx, 7, e.r, 0); neon(ctx, e.color, "rgba(255,59,92,.16)", 3.4);
        // horns + whiskers
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-e.r * 0.2, s * e.r * 0.5); ctx.lineTo(-e.r * 0.7, s * e.r); ctx.strokeStyle = "#ffd07a"; ctx.lineWidth = 3; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(e.r * 0.7, s * e.r * 0.3); ctx.lineTo(e.r * 1.4, s * e.r * 0.5); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(e.r * 0.45, s * e.r * 0.3, e.r * 0.12, 0, M.TAU); ctx.fillStyle = "#fff3c4"; ctx.fill(); }
      },
    },

    /* 🐎 HORSE — Hobby-Horse Hauler: bull-style charge but FAST, homes slightly, no charge armor, kicks dust */
    z_horse: {
      name: "Hobby-Horse Hauler", color: "#c9863f", baseHp: 1250, contact: 30, score: 1850, coins: 92, isBoss: true,
      noChargeResist: true,   // unlike the bull, takes full ram damage mid-charge
      banner: ["🐎 HOBBY-HORSE HAULER", "Gallops the aisles. Free delivery."],
      spawn(e) { const u = TD.Screen.unit; e.r = 30 * u; e.mode = "aim"; e.ang = M.rand(0, M.TAU); e.timer = 1.2; e.fire = 0; e.glow = 0; e.t = 0; },
      update(e, game, dt) {
        const u = TD.Screen.unit, W = TD.Screen.W, H = TD.Screen.H, d = dToShip(e, game); e.t += dt;
        const ph = (e.hp / e.maxHp) < 0.4 ? 2 : (e.hp / e.maxHp) < 0.7 ? 1 : 0;
        if (e.mode === "aim") {
          e.vx *= 0.86; e.vy *= 0.86;
          const ca = chargeAng(e, game, 70);
          e.ang = M.angToward(e.ang, ca, (1.4 + ph * 0.2) * dt);   // lines up a touch quicker than the bull
          e.glow = Math.min(1, e.glow + dt * 1.6);
          e.fire -= dt;
          if (e.fire <= 0) {
            e.fire = 0.28 - ph * 0.03;
            const back = e.ang + Math.PI, bx = e.x + Math.cos(back) * e.r, by = e.y + Math.sin(back) * e.r;
            for (let k = -1; k <= 1; k++) enemyShot(game, bx, by, back + k * 0.18 + M.rand(-0.05, 0.05), 220, 10, "#e8c08a", 5);
          }
          e.timer -= dt;
          if (e.timer <= 0 && Math.abs(M.angDiff(e.ang, ca)) < 0.16) { e.mode = "windup"; e.windup = 0.8; e.chargeAng = ca; e.glow = 1; game.shake(4); }
        } else if (e.mode === "windup") {
          // brief red-eye tell, still tracking, then commit
          e.vx *= 0.86; e.vy *= 0.86;
          e.chargeAng = chargeAng(e, game, 70);
          e.ang = M.angToward(e.ang, e.chargeAng, 2.0 * dt);
          e.windup -= dt;
          if (e.windup <= 0) { e.mode = "gallop"; e.chargeT = 1.1 + ph * 0.25; game.shake(5); }
        } else if (e.mode === "gallop") {
          // slight homing curve toward the player, then a FAST charge (faster than the bull)
          e.chargeAng = M.angToward(e.chargeAng, d.ang, (1.0 + ph * 0.2) * dt);
          steer(e, e.chargeAng, 1500 * u, dt, (720 + ph * 80) * u);
          e.ang = e.chargeAng;
          // long dust cloud kicked up behind the gallop (visual only, like the Glitch Cube's trail)
          if (game.particles.length < 158) {
            const back = e.ang + Math.PI, perp = e.ang + Math.PI / 2;
            for (let k = 0; k < 2; k++) {
              const lat = M.rand(-0.7, 0.7), sp = M.rand(8, 55) * u, lf = M.rand(0.45, 0.95);
              game.particles.push({
                x: e.x + Math.cos(back) * e.r * 1.1 + Math.cos(perp) * lat * e.r,
                y: e.y + Math.sin(back) * e.r * 1.1 + Math.sin(perp) * lat * e.r,
                vx: Math.cos(back) * sp + Math.cos(perp) * lat * 30 * u - e.vx * 0.04,
                vy: Math.sin(back) * sp + Math.sin(perp) * lat * 30 * u - e.vy * 0.04,
                life: lf, maxLife: lf, r: M.rand(3, 8) * u, color: "#ccab7e", kind: "dust",
              });
            }
          }
          e.chargeT -= dt;
          const m = e.r, hitWall = e.x < m || e.x > W - m || e.y < m || e.y > H - m;
          if (e.chargeT <= 0 || hitWall) { e.mode = "recover"; e.timer = 0.45; e.glow = 0; if (hitWall) { game.shake(8); game.addPop(e.x, e.y, e.r * 3, "#e8c08a", { w: 4 }); } }
        } else { // recover
          e.vx *= 0.8; e.vy *= 0.8; e.timer -= dt;
          if (e.timer <= 0) { e.mode = "aim"; e.timer = 0.4 + M.rand(0, 0.5); e.fire = 0; e.glow = 0; }
        }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        const gallop = e.mode === "gallop", tell = e.mode === "windup" || gallop;
        const rx = e.r * 1.7, ry = e.r * 0.6;   // long oval, spine along the facing (long) axis
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, M.TAU);
        neon(ctx, gallop ? "#ffe0b0" : e.color, "rgba(201,134,63,.16)", gallop ? 4 : 3);
        // mane running along the back, trailing toward the rear
        ctx.strokeStyle = "#7a4a1a"; ctx.lineWidth = 3; ctx.lineCap = "round";
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(rx * 0.25 - i * rx * 0.16, -ry * 0.45); ctx.lineTo(rx * 0.08 - i * rx * 0.16, -ry * 1.05); ctx.stroke(); }
        // tail tuft at the rear
        ctx.beginPath(); ctx.moveTo(-rx * 0.98, 0); ctx.lineTo(-rx * 1.35, ry * 0.5); ctx.moveTo(-rx * 0.98, 0); ctx.lineTo(-rx * 1.35, -ry * 0.5); ctx.moveTo(-rx * 0.98, 0); ctx.lineTo(-rx * 1.4, 0); ctx.stroke(); ctx.lineCap = "butt";
        // eyes near the front — glow red through the windup tell and the charge
        ctx.fillStyle = tell ? "#ff2d2d" : "#fff3d0"; ctx.shadowColor = "#ff2d2d"; ctx.shadowBlur = tell ? 12 : 0;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(rx * 0.66, s * ry * 0.42, e.r * 0.11, 0, M.TAU); ctx.fill(); }
        ctx.shadowBlur = 0;
      },
    },

    /* 🐐 GOAT — Knock-off G.O.A.T.: orbiting deal-satellites + headbutt */
    z_goat: {
      name: "Knock-off G.O.A.T.", color: "#d8e0e8", baseHp: 1300, contact: 28, score: 1900, coins: 95, isBoss: true,
      banner: ["🐐 KNOCK-OFF G.O.A.T.", "Greatest Of All Tariffs. Crossfires."],
      spawn(e) { const u = TD.Screen.unit; e.r = 28 * u; e.t = 0; e.sat = []; e.summon = 0.5; e.butt = 4; e.face = 0; },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        e.face = M.angToward(e.face, d.ang, 1.6 * dt); e.ang = e.face;
        if (e.charging > 0) { e.charging -= dt; steer(e, e.ca, 700 * u, dt, 420 * u); }
        else { steer(e, approachAng(e, game.ship.x, game.ship.y), 30 * u, dt, 50 * u); e.butt -= dt; if (e.butt <= 0 && d.d < 320 * u) { e.butt = M.rand(3.5, 5); e.charging = 0.7; e.ca = chargeAng(e, game, 60); } }
        // maintain up to 3 orbiting satellites that fire at you
        e.summon -= dt;
        if (e.summon <= 0 && e.sat.length < 3) { e.summon = 1.4; e.sat.push({ a: M.rand(0, M.TAU), fire: M.rand(0.5, 1.5) }); }
        for (const s of e.sat) { s.a += dt * 1.1; s.fire -= dt;
          const sx = e.x + Math.cos(s.a) * e.r * 2.4, sy = e.y + Math.sin(s.a) * e.r * 2.4;
          s.x = sx; s.y = sy;
          if (s.fire <= 0) { s.fire = M.rand(1.3, 2.0); const aa = Math.atan2(game.ship.y - sy, game.ship.x - sx); enemyShot(game, sx, sy, aa, 280, 9, "#bfe0ff", 5); } }
      },
      draw(e, ctx) {
        // satellites (world-space → offset from head)
        for (const s of e.sat) { ctx.save(); ctx.translate(s.x - e.x, s.y - e.y);
          ctx.beginPath(); ctx.arc(0, 0, e.r * 0.32, 0, M.TAU); neon(ctx, "#bfe0ff", "rgba(120,180,255,.25)", 2); ctx.restore(); }
        ctx.save(); ctx.rotate(e.ang);
        poly(ctx, 5, e.r, 0); neon(ctx, e.charging > 0 ? "#ffffff" : e.color, "rgba(216,224,232,.16)", 3);
        // curled horns
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(-e.r * 0.2, s * e.r * 0.5, e.r * 0.4, s > 0 ? -1.2 : 1.2, s > 0 ? 1.2 : -1.2, s < 0); ctx.strokeStyle = "#f0f4f8"; ctx.lineWidth = 3; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(e.r * 0.6, 0, e.r * 0.1, 0, M.TAU); ctx.fillStyle = "#ff5a7a"; ctx.fill();
        ctx.restore();
      },
    },

    /* 🐒 MONKEY — Monkey-Business Reseller: ricocheting bananas + decoys */
    z_monkey: {
      name: "Monkey-Business Reseller", color: "#ffb13b", baseHp: 1200, contact: 24, score: 1850, coins: 90, isBoss: true,
      banner: ["🐒 MONKEY-BUSINESS RESELLER", "Bananas ricochet. So do the prices."],
      spawn(e) { const u = TD.Screen.unit; e.r = 26 * u; e.t = 0; e.throwT = 1.4; e.tp = 3.5; },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        steer(e, d.ang + Math.sin(e.t * 1.5) * 1.2, 120 * u, dt, 120 * u); e.vx *= 0.95; e.vy *= 0.95;
        e.ang = e.t * 1.5;
        e.throwT -= dt;
        if (e.throwT <= 0) { e.throwT = M.rand(0.7, 1.2);
          // bouncing bananas: enemy shots flagged to ricochet off screen edges
          for (let k = -1; k <= 1; k++) { const b = game.enemyShots; if (b.length < 250) {
            const aa = d.ang + k * 0.4; b.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 230 * u, vy: Math.sin(aa) * 230 * u, r: 7 * u, dmg: 11, life: 5, color: "#ffe14d", glow: 10, bounce: 3 }); } }
        }
        e.tp -= dt;
        if (e.tp <= 0) { e.tp = M.rand(3, 5); const aa = M.rand(0, M.TAU); e.x = game.ship.x + Math.cos(aa) * 250 * u; e.y = game.ship.y + Math.sin(aa) * 250 * u; game.addPop(e.x, e.y, e.r * 2, "#ffb13b", { w: 3, life: 0.2 }); }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, M.TAU); neon(ctx, e.color, "rgba(255,177,59,.18)", 3);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(-e.r * 0.7, s * e.r * 0.7, e.r * 0.34, 0, M.TAU); neon(ctx, e.color, "rgba(255,177,59,.2)", 2); }
        ctx.beginPath(); ctx.arc(0, e.r * 0.2, e.r * 0.5, 0.2, Math.PI - 0.2); ctx.strokeStyle = "#5a3410"; ctx.lineWidth = 3; ctx.stroke();
      },
    },

    /* 🐓 ROOSTER — Cock-a-Doodle Dropshipper: rhythmic feather fans + dawn-crow */
    z_rooster: {
      name: "Cock-a-Doodle Dropshipper", color: "#ff5a4d", baseHp: 1200, contact: 26, score: 1850, coins: 90, isBoss: true,
      banner: ["🐓 COCK-A-DOODLE DROPSHIPPER", "Crows at dawn. Ships at noon."],
      spawn(e) { const u = TD.Screen.unit; e.r = 28 * u; e.t = 0; e.fan = 1.0; e.crow = 6; e.strut = 0; e.combTimer = 5; e.combOut = false; e.combShips = []; },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        steer(e, d.ang + Math.PI / 2 * Math.sin(e.t), 110 * u, dt, 90 * u); e.vx *= 0.94; e.vy *= 0.94; e.ang = d.ang;
        e.fan -= dt;
        if (e.fan <= 0) { e.fan = 1.0; for (let k = -3; k <= 3; k++) enemyShot(game, e.x, e.y, d.ang + k * 0.16, 260, 10, "#ff9c8a", 5); }
        e.crow -= dt;
        if (e.crow <= 0) { e.crow = 7; e.crowing = 0.6; }
        if (e.crowing > 0) { e.crowing -= dt; if (e.crowing <= 0) { const n = 24, off = M.rand(0, 1); for (let i = 0; i < n; i++) enemyShot(game, e.x, e.y, (i / n + off) * M.TAU, 220, 11, "#ffd07a", 6); game.shake(7); game.addPop(e.x, e.y, e.r * 3, "#ffd07a", { w: 4 }); } }
        // --- the comb: 3 little drones that launch together, strafe & shoot,
        // return to his head when destroyed, then relaunch 10s after all 3 are back ---
        if (!e.combOut) {
          e.combTimer -= dt;
          if (e.combTimer <= 0) {
            e.combShips = [];
            for (let i = 0; i < 3; i++) {
              const bx = -e.r * 0.1 + i * e.r * 0.25, by = -e.r * 0.8;
              const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
              const wx = e.x + bx * ca - by * sa, wy = e.y + bx * sa + by * ca;
              const c = game.spawnEnemy("z_rooster_comb", wx, wy, { hpScale: e.hpScale * 0.5 });
              const oa = Math.atan2(wy - e.y, wx - e.x);     // burst outward from his head
              c.vx = Math.cos(oa) * 260 * u; c.vy = Math.sin(oa) * 260 * u;
              c.sdir = i === 1 ? 1 : -1;
              e.combShips.push(c);
            }
            e.combOut = true; game.shake(6); game.toast("🐓 The comb takes flight!", "bad");
          }
        } else if (e.combShips.filter((c) => c && !c.dead).length === 0) {
          e.combOut = false; e.combTimer = 10;   // all back home → relaunch in 10s
        }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        const crowing = e.crowing > 0;
        poly(ctx, 5, e.r, 0); neon(ctx, crowing ? "#ffd07a" : e.color, "rgba(255,90,77,.16)", 3);
        // comb (3 bumps on top) — each bump shows only while that drone is home
        ctx.fillStyle = "#ff2d4f"; ctx.shadowColor = "#ff2d4f"; ctx.shadowBlur = 8;
        for (let i = 0; i < 3; i++) {
          const home = !e.combOut || !e.combShips || !e.combShips[i] || e.combShips[i].dead;
          if (!home) continue;
          ctx.beginPath(); ctx.arc(-e.r * 0.1 + i * e.r * 0.25, -e.r * 0.8, e.r * 0.16, 0, M.TAU); ctx.fill();
        }
        ctx.shadowBlur = 0;
        // beak + tail feathers
        ctx.beginPath(); ctx.moveTo(e.r * 0.8, 0); ctx.lineTo(e.r * 1.3, e.r * 0.12); ctx.lineTo(e.r * 0.8, e.r * 0.2); ctx.closePath(); ctx.fillStyle = "#ffc223"; ctx.fill();
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-e.r * 0.7, 0); ctx.lineTo(-e.r * 1.5, i * e.r * 0.6); ctx.strokeStyle = "#37b6ff"; ctx.lineWidth = 3; ctx.stroke(); }
      },
      die(e, game) { if (e.combShips) for (const c of e.combShips) if (c && !c.dead) game.killEnemy(c); },
    },

    /* 🐔 ROOSTER COMB DRONE — a launched comb-bump: strafes the player at ~200px,
       sidesteps laterally, spits red bullets. Killing it sends it back to his head.
       Boss-spawned only (never in the wave director pool). */
    z_rooster_comb: {
      name: "Comb Drone", color: "#ff2d4f", baseHp: 130, contact: 14, score: 60, coins: 8,
      spawn(e) { const u = TD.Screen.unit; e.r = 9 * u; e.t = 0; e.fire = M.rand(0.3, 0.7); e.sdir = M.chance(0.5) ? 1 : -1; e.flip = M.rand(1.4, 2.4); },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        const ideal = 200 * u;
        // hold ~200px: radial term approaches/retreats, lateral term strafes sideways
        const err = M.clamp((d.d - ideal) / (90 * u), -1, 1);
        e.flip -= dt; if (e.flip <= 0) { e.flip = M.rand(1.4, 2.6); e.sdir *= -1; }
        const latAng = d.ang + Math.PI / 2 * e.sdir;
        const vx = Math.cos(d.ang) * err + Math.cos(latAng) * 0.9;
        const vy = Math.sin(d.ang) * err + Math.sin(latAng) * 0.9;
        steer(e, Math.atan2(vy, vx), 900 * u, dt, 300 * u);
        e.vx *= 0.92; e.vy *= 0.92;
        e.ang = Math.atan2(e.vy, e.vx);
        e.fire -= dt;
        if (e.fire <= 0) { e.fire = M.rand(0.5, 0.8); enemyShot(game, e.x, e.y, d.ang + M.rand(-0.06, 0.06), 300, 7, "#ff2d4f", 4); }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.25, e.r * 0.78, 0, 0, M.TAU);
        neon(ctx, e.color, "rgba(255,45,79,.22)", 2.4);
        ctx.beginPath(); ctx.moveTo(e.r * 1.2, 0); ctx.lineTo(e.r * 0.45, e.r * 0.4); ctx.lineTo(e.r * 0.45, -e.r * 0.4); ctx.closePath();
        ctx.fillStyle = "#ffd07a"; ctx.fill();
      },
    },

    /* 🐕 DOG — Loyalty-Program Hound: herding orbits, bark shockwaves, pups */
    z_dog: {
      name: "Loyalty-Program Hound", color: "#9cc0ff", baseHp: 1250, contact: 26, score: 1850, coins: 92, isBoss: true,
      banner: ["🐕 LOYALTY-PROGRAM HOUND", "Herds you. Barks. Brings the pack."],
      spawn(e) { const u = TD.Screen.unit; e.r = 28 * u; e.t = 0; e.bark = 2.5; e.pups = 5; e.dir = 1; },
      update(e, game, dt) {
        const u = TD.Screen.unit, d = dToShip(e, game); e.t += dt;
        // orbit the player at mid range, occasionally lunge
        const ideal = 240 * u;
        if (d.d > ideal + 40) steer(e, approachAng(e, game.ship.x, game.ship.y), 260 * u, dt, 210 * u);
        else steer(e, d.ang + Math.PI / 2 * e.dir, 240 * u, dt, 200 * u);
        if (e.t % 3 < dt) e.dir *= -1;
        e.ang = Math.atan2(e.vy, e.vx);
        e.bark -= dt;
        if (e.bark <= 0) { e.bark = M.rand(2.0, 3.0); game.shake(5);
          // expanding shockwave ring of bullets (gap to dodge through)
          const n = 20, gap = M.randInt(0, n - 1);
          for (let i = 0; i < n; i++) { if (i === gap || i === (gap + 1) % n) continue; enemyShot(game, e.x, e.y, i / n * M.TAU, 200, 11, "#cfe0ff", 6); }
          game.addPop(e.x, e.y, e.r * 3, "#cfe0ff", { w: 4 }); }
        e.pups -= dt;
        if (e.pups <= 0 && game.enemies.length < 26) { e.pups = 7; for (let i = 0; i < 2; i++) { const a = M.rand(0, M.TAU); game.spawnEnemy("seeker", e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, { hpScale: e.hpScale * 0.7 }); } game.toast("🐕 The Hound whistles for the pack!", "bad"); }
      },
      draw(e, ctx) {
        ctx.rotate(e.ang);
        ctx.beginPath(); ctx.moveTo(e.r, 0); ctx.lineTo(-e.r * 0.8, e.r * 0.7); ctx.lineTo(-e.r * 0.6, 0); ctx.lineTo(-e.r * 0.8, -e.r * 0.7); ctx.closePath();
        neon(ctx, e.color, "rgba(156,192,255,.16)", 3);
        // triangular hound ears — swept forward (tips angle toward the nose), distinct from pig's upright ears
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(e.r * 0.2, s * e.r * 0.3);    // front base (near head)
          ctx.lineTo(-e.r * 0.12, s * e.r * 0.42);  // rear base
          ctx.lineTo(e.r * 0.62, s * e.r * 0.8);    // tip swept forward & out
          ctx.closePath();
          neon(ctx, e.color, "rgba(156,192,255,.22)", 2);
        }
        ctx.beginPath(); ctx.arc(e.r * 0.85, 0, e.r * 0.12, 0, M.TAU); ctx.fillStyle = "#1a2438"; ctx.fill();
      },
    },

    /* 🐖 PIG — Piggy-Bank Buster: roll-charges, bomb spew, coin jackpot on death */
    z_pig: {
      name: "Piggy-Bank Buster", color: "#ff9cc0", baseHp: 1500, contact: 30, score: 2000, coins: 160, isBoss: true,
      banner: ["🐖 PIGGY-BANK BUSTER", "Stuffed with savings. And bombs."],
      spawn(e) { const u = TD.Screen.unit; e.r = 34 * u; e.t = 0; e.roll = 3; e.spew = 1.2; e.rolling = 0; },
      update(e, game, dt) {
        const u = TD.Screen.unit, W = TD.Screen.W, H = TD.Screen.H, d = dToShip(e, game); e.t += dt;
        if (e.rolling > 0) { e.rolling -= dt; steer(e, e.ra, 520 * u, dt, 360 * u); e.spin += dt * 12;
          const m = e.r; if (e.x < m || e.x > W - m || e.y < m || e.y > H - m) { game.shake(8); const n = 14; for (let i = 0; i < n; i++) enemyShot(game, e.x, e.y, i / n * M.TAU, 180, 11, "#ffc0d8", 6); e.rolling = 0; } }
        else { steer(e, approachAng(e, game.ship.x, game.ship.y), 40 * u, dt, 55 * u); e.spin = (e.spin || 0) * 0.9; e.roll -= dt; if (e.roll <= 0 && d.d < 360 * u) { e.roll = M.rand(3.5, 5); e.rolling = 1.1; e.ra = chargeAng(e, game, 60); } }
        e.ang = Math.atan2(e.vy, e.vx);
        e.spew -= dt;
        if (e.spew <= 0 && e.rolling <= 0) { e.spew = M.rand(1.0, 1.6);
          // lob bomb-coins that detonate into shrapnel (mines)
          if (game.enemies.length < 28) game.spawnEnemy("mine", e.x + M.rand(-30, 30), e.y + M.rand(-30, 30), { hpScale: e.hpScale * 0.6 }); }
      },
      die(e, game) { game.dropCoins(e.x, e.y, 220, 260); },
      draw(e, ctx) {
        ctx.save(); ctx.rotate(e.rolling > 0 ? (e.spin || 0) : e.ang * 0.2);
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, M.TAU); neon(ctx, e.rolling > 0 ? "#ffd0e4" : e.color, "rgba(255,156,192,.18)", 3.4);
        // coin slot
        ctx.beginPath(); ctx.moveTo(-e.r * 0.3, -e.r * 0.55); ctx.lineTo(e.r * 0.3, -e.r * 0.55); ctx.strokeStyle = "#7a3a55"; ctx.lineWidth = 4; ctx.stroke();
        ctx.restore();
        // ears + snout (fixed orientation toward facing)
        ctx.save(); ctx.rotate(e.ang);
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(e.r * 0.1, s * e.r * 0.7); ctx.lineTo(e.r * 0.5, s * e.r * 0.95); ctx.lineTo(e.r * 0.5, s * e.r * 0.5); ctx.closePath(); ctx.fillStyle = "#ff80b0"; ctx.fill(); }
        ctx.beginPath(); ctx.ellipse(e.r * 0.75, 0, e.r * 0.22, e.r * 0.3, 0, 0, M.TAU); ctx.fillStyle = "#ffb0d0"; ctx.fill();
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(e.r * 0.75, s * e.r * 0.1, e.r * 0.05, 0, M.TAU); ctx.fillStyle = "#7a3a55"; ctx.fill(); }
        ctx.restore();
      },
    },
  };

  TD.ENEMIES = E;
  TD.ENEMY_FX = { followChain, initChain };   // exposed for tests / the art editor
  // Boss roster — a boss wave (every 10 lvls) picks one at random. Add more keys here.
  // The 12 Chinese-zodiac bosses (the Premium Seller is now the Wyrm's head).
  TD.BOSSES = ["serpent", "rammer",
    "z_rat", "z_tiger", "z_rabbit", "z_dragon", "z_horse",
    "z_goat", "z_monkey", "z_rooster", "z_dog", "z_pig"];
  // Miniboss roster — a mini wave (every 5 lvls, off-boss) picks one at random. Add more here.
  TD.MINIBOSSES = ["bolas", "disco", "reaper", "crusher", "hydra", "bomber", "ringcharger", "turret", "dasher", "vortex"];

  /* ====================== SPAWN DIRECTOR ====================== */
  const Director = {
    reset(game) {
      this.t = 0; this.spawnT = 2.2; this.game = game;
    },
    // which types are unlocked at a given difficulty level
    pool(level) {
      const p = [["roid", 5], ["seeker", 4]];
      if (level >= 2) p.push(["weaver", 4]);
      if (level >= 3) p.push(["spinner", 3]);
      if (level >= 4) p.push(["mine", 2]);
      if (level >= 5) p.push(["splitter", 3]);
      if (level >= 5) p.push(["clearance", 3]);
      if (level >= 6) p.push(["sniper", 3]);
      if (level >= 8) p.push(["bulwark", 2]);
      return p;
    },
    weightedPick(pool) {
      let tot = 0; for (const [, w] of pool) tot += w;
      let r = Math.random() * tot;
      for (const [k, w] of pool) { if ((r -= w) <= 0) return k; }
      return pool[0][0];
    },
    update(game, dt) {
      if (game.bossActive) return; // pause normal spawns during boss
      this.t += dt;
      this.spawnT -= dt;
      const level = game.level;
      // target population grows with level & time, capped for perf
      const cap = Math.min(7 + level * 1.4 + Math.floor(this.t / 36), 26);
      if (this.spawnT <= 0 && game.enemies.length < cap) {
        const pool = this.pool(level);
        // spawn a small batch
        const batch = 1 + (Math.random() < 0.28 ? 1 : 0) + (level > 8 ? 1 : 0);
        for (let i = 0; i < batch && game.enemies.length < cap; i++) {
          const type = this.weightedPick(pool);
          const opts = {};
          if (type === "weaver") this.spawnPack(game, type, 2 + M.randInt(0, 2));
          else game.spawnAtEdge(type, opts);
        }
        // spawn interval shrinks with level
        this.spawnT = Math.max(0.9, 3.1 - level * 0.09 - this.t * 0.0028);
      }
    },
    spawnPack(game, type, n) {
      const edge = game.edgePoint();
      for (let i = 0; i < n; i++) {
        const e = game.spawnEnemy(type, edge.x + M.rand(-40, 40), edge.y + M.rand(-40, 40), {});
      }
    },
  };
  TD.Director = Director;
})();
