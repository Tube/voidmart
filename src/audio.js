/* ============================================================
   VOIDMART — audio.js
   Tiny WebAudio synth: all SFX generated on the fly (no files).
   Spacey echoes via a feedback delay send. Lazily unlocked on
   first user gesture (mobile autoplay policy).
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;

  const Audio = {
    ctx: null, enabled: true, ready: false,
    _last: {},

    init() {
      if (this.ctx) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());

      // master bus -> soft compressor -> out
      const master = (this.master = ctx.createGain());
      master.gain.value = 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 3.4;
      comp.attack.value = 0.004; comp.release.value = 0.2;
      master.connect(comp); comp.connect(ctx.destination);

      // "space" send: feedback delay -> lowpass -> master (gives echoey depth)
      const spaceIn = (this.spaceIn = ctx.createGain());
      spaceIn.gain.value = 0.9;
      const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.19;
      const fb = ctx.createGain(); fb.gain.value = 0.34;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
      const sg = ctx.createGain(); sg.gain.value = 0.5;
      spaceIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay);
      lp.connect(sg); sg.connect(master);

      // white-noise buffer (reused)
      const len = ctx.sampleRate * 1.0;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      // continuous engine/thrust hum (gain driven by ship.flame)
      const eng = ctx.createBufferSource(); eng.buffer = buf; eng.loop = true;
      const engBp = ctx.createBiquadFilter(); engBp.type = "bandpass"; engBp.frequency.value = 110; engBp.Q.value = 2.5;
      const engGain = (this.engGain = ctx.createGain()); engGain.gain.value = 0.0001;
      const engLp = ctx.createBiquadFilter(); engLp.type = "lowpass"; engLp.frequency.value = 480;
      eng.connect(engBp); engBp.connect(engLp); engLp.connect(engGain); engGain.connect(master);
      try { eng.start(); } catch (_) {}

      this.ready = true;
      this.resume();
    },
    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.85 : 0;
    },
    now() { return this.ctx.currentTime; },
    ok(key, ms) {
      if (!this.ctx || !this.enabled) return false;
      if (ms) {
        const t = performance.now();
        if (this._last[key] && t - this._last[key] < ms) return false;
        this._last[key] = t;
      }
      return true;
    },

    /* ---- primitive voices ---- */
    tone(o) {
      const ctx = this.ctx, t = this.now() + (o.at || 0);
      const dur = o.dur || 0.12, peak = o.gain == null ? 0.2 : o.gain;
      const osc = ctx.createOscillator(); osc.type = o.type || "square";
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
      if (o.detune) osc.detune.value = o.detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + (o.atk || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.master);
      if (o.space) { const s = ctx.createGain(); s.gain.value = o.space; g.connect(s); s.connect(this.spaceIn); }
      osc.start(t); osc.stop(t + dur + 0.03);
      return osc;
    },
    noise(o) {
      const ctx = this.ctx, t = this.now() + (o.at || 0);
      const dur = o.dur || 0.15, peak = o.gain == null ? 0.2 : o.gain;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = o.filter || "lowpass";
      f.frequency.setValueAtTime(o.freq || 1000, t);
      if (o.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.freqTo), t + dur);
      if (o.Q) f.Q.value = o.Q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + (o.atk || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      if (o.space) { const s = ctx.createGain(); s.gain.value = o.space; g.connect(s); s.connect(this.spaceIn); }
      src.start(t); src.stop(t + dur + 0.03);
    },

    /* ---- engine hum ---- */
    setThrust(level) {
      if (!this.engGain) return;
      const target = Math.max(0.0001, level * 0.16);
      this.engGain.gain.setTargetAtTime(target, this.now(), 0.05);
    },

    /* ---- SFX ---- */
    shoot(weapon) {
      if (!this.ok("shoot", 32)) return;
      // main weapon plays constantly — render its voices 25% quieter
      const V = 0.75, _t = this.tone, _n = this.noise;
      this.tone = (o) => _t.call(this, Object.assign({}, o, { gain: (o.gain == null ? 0.2 : o.gain) * V }));
      this.noise = (o) => _n.call(this, Object.assign({}, o, { gain: (o.gain == null ? 0.2 : o.gain) * V }));
      switch (weapon) {
        case "pulse":
          this.tone({ freq: 1100, to: 620, type: "square", dur: 0.06, gain: 0.09, space: 0.18 }); break;
        case "rail":
          this.tone({ freq: 240, to: 60, type: "sawtooth", dur: 0.28, gain: 0.26, space: 0.3 });
          this.noise({ freq: 1400, freqTo: 300, dur: 0.22, gain: 0.16, space: 0.2 }); break;
        case "flak":
          this.noise({ freq: 1100, freqTo: 500, dur: 0.1, gain: 0.18 });
          this.tone({ freq: 200, to: 110, type: "square", dur: 0.08, gain: 0.12 }); break;
        case "missiles":
          this.noise({ filter: "bandpass", freq: 500, freqTo: 1600, Q: 6, dur: 0.2, gain: 0.12, space: 0.25 }); break;
        case "blades":
          this.tone({ freq: 720, to: 900, type: "triangle", dur: 0.14, gain: 0.1, space: 0.3 }); break;
        case "arc":
          this.noise({ filter: "highpass", freq: 2600, dur: 0.08, gain: 0.14, space: 0.2 });
          this.tone({ freq: 1600 + Math.random() * 600, type: "square", dur: 0.05, gain: 0.06 }); break;
        case "split":
          this.tone({ freq: 520, to: 170, type: "sawtooth", dur: 0.07, gain: 0.13 }); break;
        default: // blaster
          this.tone({ freq: 540, to: 170, type: "square", dur: 0.07, gain: 0.14 });
      }
      this.tone = _t; this.noise = _n; // restore full-volume voices
    },
    hit() {
      if (!this.ok("hit", 38)) return;
      this.tone({ freq: 360 + Math.random() * 120, to: 200, type: "square", dur: 0.04, gain: 0.07 });
    },
    crit() {
      if (!this.ok("crit", 50)) return;
      this.tone({ freq: 1500, to: 900, type: "square", dur: 0.06, gain: 0.1, space: 0.15 });
    },
    explosion(size) {
      if (!this.ok("expl", 40)) return;
      const s = Math.min(Math.max(size || 14, 8), 60) / 30;
      this.noise({ freq: 900 * s + 200, freqTo: 90, dur: 0.18 + s * 0.2, gain: 0.18, space: 0.28 });
      this.tone({ freq: 160 * (1.4 - s), to: 50, type: "sawtooth", dur: 0.18 + s * 0.15, gain: 0.16 });
    },
    coin() {
      if (!this.ok("coin", 45)) return;
      const base = 880 + Math.random() * 120;
      this.tone({ freq: base, type: "sine", dur: 0.05, gain: 0.08 });
      this.tone({ freq: base * 1.5, type: "sine", dur: 0.07, gain: 0.08, at: 0.04, space: 0.2 });
    },
    shieldHit() {
      if (!this.ok("sh", 30)) return;
      this.tone({ freq: 1400, to: 700, type: "sine", dur: 0.12, gain: 0.12, space: 0.25 });
      this.tone({ freq: 2100, type: "sine", dur: 0.06, gain: 0.05 });
    },
    playerHit() {
      this.noise({ freq: 600, freqTo: 120, dur: 0.22, gain: 0.22, space: 0.2 });
      this.tone({ freq: 120, to: 50, type: "sawtooth", dur: 0.2, gain: 0.18 });
    },
    shieldBreak() {
      this.tone({ freq: 300, to: 900, type: "sawtooth", dur: 0.18, gain: 0.14, space: 0.3 });
      this.noise({ filter: "highpass", freq: 1800, dur: 0.16, gain: 0.12, space: 0.3 });
    },
    heal() {
      [784, 988, 1319].forEach((f, i) => this.tone({ freq: f, type: "sine", dur: 0.18, gain: 0.1, at: i * 0.06, space: 0.25 }));
    },
    levelUp() {
      // bright "ka-ching" sparkle arpeggio
      [659, 880, 1175, 1568].forEach((f, i) =>
        this.tone({ freq: f, type: "triangle", dur: 0.16, gain: 0.12, at: i * 0.07, space: 0.3 }));
      this.tone({ freq: 2093, type: "sine", dur: 0.2, gain: 0.08, at: 0.28, space: 0.35 });
    },
    cartAdd() {
      // "cha-ching"
      this.tone({ freq: 1568, type: "square", dur: 0.07, gain: 0.12 });
      this.tone({ freq: 2093, type: "square", dur: 0.12, gain: 0.12, at: 0.08, space: 0.25 });
      this.noise({ filter: "highpass", freq: 4000, dur: 0.05, gain: 0.06, at: 0.02 });
    },
    reroll() { this.tone({ freq: 700, to: 1100, type: "triangle", dur: 0.12, gain: 0.1, space: 0.2 }); },
    bossSpawn() {
      this.tone({ freq: 70, to: 180, type: "sawtooth", dur: 1.1, gain: 0.24, space: 0.35 });
      this.tone({ freq: 110, to: 220, type: "square", dur: 1.1, gain: 0.1, space: 0.3, detune: 8 });
      this.noise({ freq: 300, freqTo: 1200, dur: 0.9, gain: 0.1, space: 0.4 });
    },
    bossDie() {
      this.explosion(60);
      [1175, 880, 659, 440].forEach((f, i) =>
        this.tone({ freq: f, type: "triangle", dur: 0.3, gain: 0.14, at: 0.1 + i * 0.12, space: 0.4 }));
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) =>
        this.tone({ freq: f, type: "sawtooth", dur: 0.4, gain: 0.16, at: i * 0.22, space: 0.35 }));
    },
    start() {
      this.setThrust(0);
      [523, 659, 784, 1047].forEach((f, i) =>
        this.tone({ freq: f, type: "triangle", dur: 0.2, gain: 0.12, at: i * 0.08, space: 0.3 }));
    },
    ui() { this.tone({ freq: 880, type: "square", dur: 0.05, gain: 0.08 }); },
    // low-hull alarm — a short descending two-tone whoop (game calls it on a cadence)
    klaxon() {
      if (!this.ok("klaxon", 250)) return;
      this.tone({ freq: 760, to: 470, type: "sawtooth", dur: 0.26, gain: 0.12, space: 0.12 });
      this.tone({ freq: 380, to: 235, type: "square", dur: 0.26, gain: 0.06 });
    },
  };

  TD.Audio = Audio;
})();
