/* ============================================================
   VOIDMART — core.js
   Namespace, math/RNG helpers, responsive canvas, pointer input.
   ============================================================ */
(function () {
  "use strict";

  const TD = (window.TD = window.TD || {});

  /* ---------- math ---------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const chance = (p) => Math.random() < p;
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // shortest signed angular difference b-a in [-PI,PI]
  function angDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  // rotate `a` toward `b` by at most `max`
  function angToward(a, b, max) {
    const d = angDiff(a, b);
    if (Math.abs(d) <= max) return b;
    return a + Math.sign(d) * max;
  }
  function len(x, y) { return Math.hypot(x, y); }

  // toroidal (screen-wrap) distance components; returns {dx,dy,d}
  function wrapDelta(ax, ay, bx, by, W, H) {
    let dx = bx - ax, dy = by - ay;
    if (dx > W * 0.5) dx -= W; else if (dx < -W * 0.5) dx += W;
    if (dy > H * 0.5) dy -= H; else if (dy < -H * 0.5) dy += H;
    return { dx, dy, d: Math.hypot(dx, dy) };
  }

  TD.math = { TAU, clamp, lerp, rand, randInt, pick, chance, shuffle, angDiff, angToward, len, wrapDelta };

  /* ---------- responsive canvas ---------- */
  const Screen = {
    canvas: null,
    ctx: null,
    W: 0, H: 0,          // CSS px logical size
    dpr: 1,
    onResize: null,
    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      const fit = () => this.resize();
      window.addEventListener("resize", fit);
      window.addEventListener("orientationchange", () => setTimeout(fit, 120));
      if (window.visualViewport) window.visualViewport.addEventListener("resize", fit);
      this.resize();
    },
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      // use visualViewport when available (mobile address-bar aware)
      const vw = Math.round((window.visualViewport && window.visualViewport.width) || window.innerWidth);
      const vh = Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight);
      this.W = vw; this.H = vh; this.dpr = dpr;
      this.canvas.width = Math.round(vw * dpr);
      this.canvas.height = Math.round(vh * dpr);
      this.canvas.style.width = vw + "px";
      this.canvas.style.height = vh + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // reference scale: how big things should be relative to a "design" phone.
      // Used to keep ship/enemy sizes sensible across tiny phones & big desktops.
      this.diag = Math.hypot(vw, vh);
      this.unit = TD.math.clamp(Math.min(vw, vh) / 520, 0.72, 1.9);
      if (this.onResize) this.onResize(vw, vh);
    },
  };
  TD.Screen = Screen;

  /* ---------- pointer input ----------
     One-finger / mouse: while held, ship steers toward the point and thrusts.
     We track ALL active touch points but use the first/primary for steering.
  ------------------------------------------------------------------- */
  const Input = {
    active: false,
    x: 0, y: 0,         // current pointer pos (CSS px)
    pointerId: null,
    enabled: false,
    boost: false,       // (reserved) double-tap boost
    lastTapTime: 0,
    attach(canvas) {
      const setPos = (e) => {
        const r = canvas.getBoundingClientRect();
        this.x = e.clientX - r.left;
        this.y = e.clientY - r.top;
      };
      canvas.addEventListener("pointerdown", (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        if (this.pointerId === null) {
          this.pointerId = e.pointerId;
          this.active = true;
          setPos(e);
          // double-tap detect for boost
          const now = performance.now();
          if (now - this.lastTapTime < 280) this.boost = true;
          this.lastTapTime = now;
          try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        }
      }, { passive: false });
      canvas.addEventListener("pointermove", (e) => {
        if (!this.enabled) return;
        if (e.pointerId === this.pointerId) { e.preventDefault(); setPos(e); }
      }, { passive: false });
      const end = (e) => {
        if (e.pointerId === this.pointerId) {
          this.pointerId = null;
          this.active = false;
          this.boost = false;
        }
      };
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);
      canvas.addEventListener("lostpointercapture", end);
      // block context menu / scroll gestures
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    },
    reset() { this.active = false; this.pointerId = null; this.boost = false; },
  };
  TD.Input = Input;

  /* ---------- tiny event bus ---------- */
  TD.bus = {
    _m: {},
    on(k, f) { (this._m[k] = this._m[k] || []).push(f); },
    emit(k, ...a) { (this._m[k] || []).forEach((f) => f(...a)); },
  };

})();
