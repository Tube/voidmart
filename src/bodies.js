/* ============================================================
   VOIDMART — bodies.js
   5 ship chassis offered on the FIRST (welcome) wheel spin instead
   of a rare power. Each has a distinct silhouette + stat profile.
   A body's apply() mutates ship.stats once; draw() renders the hull.
   Extensible: add an entry to LIST and it joins the welcome wheel.
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;
  const M = TD.math;

  // closed-poly hull: dark fill, colored glow stroke, bright inner line, cockpit dot
  function hull(ctx, color, inv, pts, cockpit) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i][0], pts[i][1]);
    ctx.closePath();
    // fill the body with the outline color so the ship reads as a solid shape in chaos
    ctx.fillStyle = inv ? "#ffffff" : color;
    ctx.lineWidth = 2.4; ctx.strokeStyle = inv ? "#ffffff" : color;
    ctx.shadowColor = color; ctx.shadowBlur = 15; ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.6; ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.stroke();
    if (cockpit) {
      ctx.beginPath(); ctx.arc(cockpit[0], cockpit[1], cockpit[2], 0, M.TAU);
      ctx.fillStyle = "rgba(10,16,32,.92)"; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
    }
  }

  const LIST = [
    {
      id: "balanced", name: "Lucky Clover", icon: "🍀", seg: "#3dd980", color: "#3dd980",
      desc: "All-rounder hull with a thrifty streak: +10% crit chance and +15% coins from kills.",
      apply(st) { st.critChance += 0.10; st.coinDrop *= 1.15; },
      draw(ctx, r, inv) {
        hull(ctx, this.color, inv, [[r * 1.4, 0], [-r, r * 0.85], [-r * 0.5, 0], [-r, -r * 0.85]], [r * 0.25, 0, r * 0.28]);
      },
    },
    {
      id: "offense", name: "Glass Dagger", icon: "🗡️", seg: "#ff5a4d", color: "#ff5a4d",
      desc: "+25% fire rate, +20% damage — but 30% less field. Hits hard, folds fast.",
      apply(st) { st.fireRate *= 1.25; st.damage *= 1.2; st.maxShield = Math.round(st.maxShield * 0.7); },
      draw(ctx, r, inv) {
        hull(ctx, this.color, inv, [
          [r * 1.75, 0], [r * 0.1, r * 0.34], [-r * 0.9, r * 1.05], [-r * 0.5, r * 0.2],
          [-r * 0.95, 0], [-r * 0.5, -r * 0.2], [-r * 0.9, -r * 1.05], [r * 0.1, -r * 0.34],
        ], [r * 0.4, 0, r * 0.2]);
      },
    },
    {
      id: "defense", name: "Bunker Hull", icon: "🛡️", seg: "#7bd0ff", color: "#7bd0ff",
      desc: "Huge field + hull and beefy regen. Slightly sluggish guns & thrust (−10% each).",
      apply(st) {
        st.thrust *= 0.9; st.fireRate *= 0.9;
        st.maxShield = Math.round(st.maxShield * 1.5); st.maxHull += 40;
        st.shieldRegen *= 1.4; st.shieldDelay = Math.max(0.6, st.shieldDelay - 0.5);
      },
      draw(ctx, r, inv) {
        hull(ctx, this.color, inv, [
          [r * 1.1, 0], [r * 0.45, r * 0.9], [-r * 0.75, r * 0.95],
          [-r * 1.05, 0], [-r * 0.75, -r * 0.95], [r * 0.45, -r * 0.9],
        ], [0, 0, r * 0.36]);
        // front armor plate
        ctx.beginPath(); ctx.arc(0, 0, r * 0.96, -0.7, 0.7);
        ctx.lineWidth = 3.4; ctx.strokeStyle = inv ? "#ffffff" : "#cfeeff";
        ctx.shadowColor = this.color; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
      },
    },
    {
      id: "ramming", name: "Bumper Cart", icon: "🐏", seg: "#ffb13b", color: "#ffb13b",
      desc: "Built to bonk: massive ram damage, takes far less on impact, +20% thrust, −10% gun damage.",
      apply(st) { st.thrust *= 1.2; st.damage *= 0.9; st.bodyDmg += 55; st.ramArmor = Math.min(0.7, st.ramArmor + 0.45); },
      draw(ctx, r, inv) {
        hull(ctx, this.color, inv, [
          [r * 0.9, r * 0.72], [-r * 0.9, r * 0.85], [-r * 0.6, 0], [-r * 0.9, -r * 0.85], [r * 0.9, -r * 0.72],
        ], [-r * 0.15, 0, r * 0.26]);
        // chunky front bumper bar
        ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 0.8);
        ctx.quadraticCurveTo(r * 1.5, 0, r * 0.95, r * 0.8);
        ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.strokeStyle = inv ? "#ffffff" : "#ffe1b0";
        ctx.shadowColor = this.color; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0; ctx.lineCap = "butt";
      },
    },
    {
      id: "cannon", name: "Siege Platform", icon: "💥", seg: "#c79bff", color: "#c79bff",
      desc: "+30% gun damage & +3 projectiles. Heavy: −25% thrust, −30% turn, −10% fire rate.",
      apply(st) { st.thrust *= 0.75; st.turn *= 0.7; st.fireRate *= 0.9; st.damage *= 1.3; st.projAdd += 3; },
      draw(ctx, r, inv) {
        // heavy body
        hull(ctx, this.color, inv, [
          [r * 0.6, r * 0.72], [-r * 0.95, r * 0.8], [-r * 0.65, 0], [-r * 0.95, -r * 0.8], [r * 0.6, -r * 0.72],
        ], [-r * 0.2, 0, r * 0.24]);
        // big forward barrel — darker so it stays distinct against the colored body
        ctx.beginPath(); ctx.rect(r * 0.2, -r * 0.28, r * 1.3, r * 0.56);
        ctx.fillStyle = inv ? "rgba(255,255,255,.55)" : "rgba(40,28,66,.92)";
        ctx.lineWidth = 2.4; ctx.strokeStyle = inv ? "#ffffff" : this.color;
        ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        // muzzle ring
        ctx.beginPath(); ctx.arc(r * 1.5, 0, r * 0.3, -1.3, 1.3);
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.stroke();
      },
    },
  ];

  const BY_ID = {};
  LIST.forEach((b) => { b.isBody = true; BY_ID[b.id] = b; });

  TD.BODIES = {
    LIST, BY_ID,
    roll(n) { n = n || 3; return M.shuffle(LIST).slice(0, Math.min(n, LIST.length)); },
  };
})();
