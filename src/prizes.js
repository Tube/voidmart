/* ============================================================
   VOIDMART — prizes.js
   The "Prize Wheel" pool: 10 build-defining meta-powers that are
   distinct from the normal shop upgrades. Each spin shows 3 of 10.
   Powers STACK (count tracked in ship.prizes[id]); effects are read
   live by game.js. Metadata + roll() live here.
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;
  const M = TD.math;

  // seg = wheel segment colour
  const LIST = [
    { id: "overstock", name: "Overstock Overflow", icon: "📦", seg: "#ff8a2b",
      desc: "Every few shots, dump a HUGE piercing bulk-package. Stacks: fires sooner & bigger." },
    { id: "coincannon", name: "Coin-Powered Cannon", icon: "🪙", seg: "#ffc223",
      desc: "Firepower grows with every coin you've ever hoarded. Stacks: more per coin." },
    { id: "loyalty", name: "Loyalty Streak", icon: "🔥", seg: "#ff4d6d",
      desc: "Chain kills without being hit to ramp damage + fire rate. Stacks: higher ceiling." },
    { id: "crowd", name: "Bulk Discount", icon: "👥", seg: "#19c37d",
      desc: "The more enemies crowding you, the harder every shot lands. Stacks: bigger bonus." },
    { id: "retaliate", name: "Return-to-Sender", icon: "↩️", seg: "#37b6ff",
      desc: "Taking a hit spits a retaliating ring of your own shots. Stacks: denser ring." },
    { id: "shockwave", name: "Doorbuster Shockwave", icon: "💢", seg: "#c46bff",
      desc: "Periodically unleash a shockwave that damages & shoves foes. Stacks: faster & wider." },
    { id: "twoday", name: "Two-Day Shipping", icon: "⚡", seg: "#5b8cff",
      desc: "Big thrust & top-speed boost; your slipstream scorches grazed enemies. Stacks: hotter." },
    { id: "impulse", name: "Impulse Buy", icon: "🎯", seg: "#ff3d8b",
      desc: "Grabbing coins may auto-launch a homing missile. Stacks: higher odds & volleys." },
    { id: "blackstar", name: "Black-Star Membership", icon: "⭐", seg: "#9d6bff",
      desc: "Slowly bank an OVERCHARGE shield above your normal field cap. Stacks: bigger reserve." },
    { id: "chain", name: "Clearance Chain-Reaction", icon: "💥", seg: "#ff6a13",
      desc: "Slain foes may erupt in a coin-nova that ignites their neighbours. Stacks: chains harder." },
  ];

  const BY_ID = {};
  LIST.forEach((p) => (BY_ID[p.id] = p));

  TD.PRIZES = {
    LIST, BY_ID,
    // pick `n` distinct prizes from the pool (duplicates of owned ARE allowed to appear again)
    roll(n) {
      n = n || 3;
      return M.shuffle(LIST).slice(0, n);
    },
  };
})();
