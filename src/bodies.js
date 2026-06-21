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

  // brighten a #hex toward white by amt (0..1) → "rgb(r,g,b)"
  function lighten(hex, amt) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  // closed-poly hull: colored glow stroke, bright inner line, and a slow-blinking neon cockpit dot.
  // `up` (Mark-2 upgrade) gives the outline a stronger glowing halo so upgraded hulls read distinct.
  function hull(ctx, color, inv, pts, cockpit, up) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i][0], pts[i][1]);
    ctx.closePath();
    // fill the body with the outline color so the ship reads as a solid shape in chaos
    ctx.fillStyle = inv ? "#ffffff" : color;
    ctx.lineWidth = 2.4; ctx.strokeStyle = inv ? "#ffffff" : color;
    ctx.shadowColor = color; ctx.shadowBlur = up ? 28 : 15; ctx.fill(); ctx.stroke();
    if (up && !inv) { ctx.lineWidth = 3.4; ctx.strokeStyle = lighten(color, 0.3); ctx.shadowBlur = 20; ctx.stroke(); }
    ctx.shadowBlur = 0; ctx.lineWidth = 1.6; ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.stroke();
    if (cockpit) {
      const t = (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
      const pulse = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 2.0));   // slow neon blink
      const bright = lighten(color, 0.5);
      ctx.beginPath(); ctx.arc(cockpit[0], cockpit[1], cockpit[2], 0, M.TAU);
      ctx.globalAlpha = inv ? 1 : pulse;
      ctx.fillStyle = inv ? "#ffffff" : bright;
      ctx.shadowColor = bright; ctx.shadowBlur = inv ? 0 : 10; ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.stroke();
    }
  }

  const LIST = [
    {
      id: "balanced", name: "Lucky Clover", icon: "🍀", seg: "#3dd980", color: "#3dd980",
      desc: "All-rounder hull with a thrifty streak: +10% crit chance and +15% coins from kills.",
      apply(st) { st.critChance += 0.10; st.coinDrop *= 1.15; },
      draw(ctx, r, inv, up) {
        hull(ctx, this.color, inv, [[r * 1.4, 0], [-r, r * 0.85], [-r * 0.5, 0], [-r, -r * 0.85]], [r * 0.25, 0, r * 0.28], up);
      },
    },
    {
      id: "offense", name: "Glass Dagger", icon: "🗡️", seg: "#ff5a4d", color: "#ff5a4d",
      desc: "+25% fire rate, +20% damage — but 30% less field. Hits hard, folds fast.",
      apply(st) { st.fireRate *= 1.25; st.damage *= 1.2; st.maxShield = Math.round(st.maxShield * 0.7); },
      draw(ctx, r, inv, up) {
        hull(ctx, this.color, inv, [
          [r * 1.75, 0], [r * 0.1, r * 0.34], [-r * 0.9, r * 1.05], [-r * 0.5, r * 0.2],
          [-r * 0.95, 0], [-r * 0.5, -r * 0.2], [-r * 0.9, -r * 1.05], [r * 0.1, -r * 0.34],
        ], [r * 0.4, 0, r * 0.2], up);
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
      draw(ctx, r, inv, up) {
        hull(ctx, this.color, inv, [
          [r * 1.1, 0], [r * 0.45, r * 0.9], [-r * 0.75, r * 0.95],
          [-r * 1.05, 0], [-r * 0.75, -r * 0.95], [r * 0.45, -r * 0.9],
        ], [0, 0, r * 0.36], up);
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
      draw(ctx, r, inv, up) {
        hull(ctx, this.color, inv, [
          [r * 0.9, r * 0.72], [-r * 0.9, r * 0.85], [-r * 0.6, 0], [-r * 0.9, -r * 0.85], [r * 0.9, -r * 0.72],
        ], [-r * 0.15, 0, r * 0.26], up);
        // thicker forward V/chevron bumper (over where the old bar was)
        ctx.beginPath();
        ctx.moveTo(r * 0.9, -r * 0.85); ctx.lineTo(r * 1.55, 0); ctx.lineTo(r * 0.9, r * 0.85);
        ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = inv ? "#ffffff" : "#ffe1b0";
        ctx.shadowColor = this.color; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0; ctx.lineCap = "butt"; ctx.lineJoin = "miter";
      },
    },
    {
      id: "cannon", name: "Siege Platform", icon: "💥", seg: "#c79bff", color: "#c79bff",
      desc: "+30% gun damage & +3 projectiles. Heavy: −25% thrust, −30% turn, −10% fire rate.",
      apply(st) { st.thrust *= 0.75; st.turn *= 0.7; st.fireRate *= 0.9; st.damage *= 1.3; st.projAdd += 3; },
      draw(ctx, r, inv, up) {
        // heavy body
        hull(ctx, this.color, inv, [
          [r * 0.6, r * 0.72], [-r * 0.95, r * 0.8], [-r * 0.65, 0], [-r * 0.95, -r * 0.8], [r * 0.6, -r * 0.72],
        ], [-r * 0.2, 0, r * 0.24], up);
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

  // The free starter hull. Same chassis + base stats as the Lucky Clover, but
  // stripped of its crit/coin perks (no apply()) and painted plain gray. Used
  // when a player hasn't unlocked the welcome ship wheel. Intentionally kept OUT
  // of LIST so it is never offered as a wheel option.
  const DEFAULT = {
    id: "default", name: "Store Brand", icon: "🛒", seg: "#b9bdc9", color: "#b9bdc9",
    isBody: true,
    desc: "Standard-issue hull. No frills, no bonuses — but it flies.",
    draw(ctx, r, inv) {
      hull(ctx, this.color, inv, [[r * 1.4, 0], [-r, r * 0.85], [-r * 0.5, 0], [-r, -r * 0.85]], [r * 0.25, 0, r * 0.28], up);
    },
  };

  const BY_ID = {};
  LIST.forEach((b) => { b.isBody = true; BY_ID[b.id] = b; });
  BY_ID[DEFAULT.id] = DEFAULT;

  TD.BODIES = {
    LIST, BY_ID, DEFAULT,
    roll(n) { n = n || 3; return M.shuffle(LIST).slice(0, Math.min(n, LIST.length)); },
  };
})();
