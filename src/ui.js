/* ============================================================
   VOIDMART — ui.js
   DOM overlay: HUD, shop sheet, start/over screens, toasts, banner.
   ============================================================ */
(function () {
  "use strict";
  const TD = window.TD;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  const UI = {
    el: {},
    init() {
      this.el = {
        hud: $("hud"), pauseBtn: $("pauseBtn"), muteBtn: $("muteBtn"),
        hullFill: $("hullFill"), hullLabel: $("hullLabel"),
        shieldFill: $("shieldFill"), shieldLabel: $("shieldLabel"),
        scoreNum: $("scoreNum"), wavePill: $("wavePill"),
        cartFill: $("cartFill"), cartText: $("cartText"), coinNum: $("coinNum"),
        startScreen: $("startScreen"), shopScreen: $("shopScreen"),
        overScreen: $("overScreen"), shopCards: $("shopCards"),
        rerollBtn: $("rerollBtn"), rerollCount: $("rerollCount"),
        flashTimer: $("flashTimer"), bossBanner: $("bossBanner"),
        toasts: $("toasts"), receipt: $("receipt"),
        wheelScreen: $("wheelScreen"), wheelTrack: $("wheelTrack"),
        spinBtn: $("spinBtn"), wheelKicker: $("wheelKicker"), wheelSkipBtn: $("wheelSkipBtn"),
        wheelTitle: $("wheelTitle"), wheelSub: $("wheelSub"),
        overReason: $("overReason"), overTip: $("overTip"),
      };
    },

    show(name) {
      ["startScreen", "shopScreen", "overScreen", "wheelScreen"].forEach((k) =>
        this.el[k].classList.toggle("hidden", k !== name));
    },

    enterPlay() {
      this.show(null);
      this.el.hud.classList.remove("hidden");
      this.el.pauseBtn.classList.remove("hidden");
      this.el.muteBtn.classList.remove("hidden");
    },

    updateHUD(g) {
      const s = g.ship;
      const maxH = s.baseHull + s.stats.maxHull;
      const hp = Math.max(0, s.hull);
      this.el.hullFill.style.width = (hp / maxH * 100) + "%";
      this.el.hullLabel.textContent = "HULL " + Math.ceil(hp);
      const sm = Math.max(1, s.stats.maxShield);
      this.el.shieldFill.style.width = (Math.max(0, s.shield) / sm * 100) + "%";
      this.el.shieldLabel.textContent = "FIELD " + Math.ceil(Math.max(0, s.shield));
      this.el.scoreNum.textContent = fmt(g.score);
      this.el.wavePill.textContent = g.bossActive ? "⭐ BOSS" : "DAY " + g.day;
      this.el.wavePill.style.background = g.bossActive ? "#ff2d4f" : "";
      const cf = Math.min(1, g.xp / g.xpNeed);
      this.el.cartFill.style.width = (cf * 100) + "%";
      this.el.cartFill.classList.toggle("full", cf > 0.85);
      this.el.cartText.textContent = "LVL " + g.level;
      this.el.coinNum.textContent = fmt(g.coinTotal);
      if (g.ship && g.ship.coinPop > 0) {
        this.el.coinNum.style.display = "inline-block";
        this.el.coinNum.style.transform = "scale(" + (1 + g.ship.coinPop * 0.06) + ")";
        g.ship.coinPop *= 0.8;
        if (g.ship.coinPop < 0.1) { g.ship.coinPop = 0; this.el.coinNum.style.transform = ""; }
      }
    },

    pause(on) {
      this.el.pauseBtn.textContent = on ? "▶" : "II";
    },

    /* ---------- SHOP ---------- */
    openShop(g, offers) {
      this.el.shopScreen.classList.remove("hidden");
      this.el.hud.classList.add("hidden");
      this.el.pauseBtn.classList.add("hidden");
      this.renderOffers(g, offers);
      // brief input lock so a held tap from gameplay can't instantly buy before you read the cards
      const cards = this.el.shopCards;
      cards.style.pointerEvents = "none";
      clearTimeout(this._shopArmT);
      this._shopArmT = setTimeout(() => { cards.style.pointerEvents = ""; }, 200);
      this.el.muteBtn.classList.add("hidden");
      // "See other deals" (reroll) is a paid perk — hide it for free players.
      const paid = !!(TD.Entitlement && TD.Entitlement.isUnlocked());
      this.el.rerollBtn.classList.toggle("hidden", !paid);
      if (paid) {
        this.el.rerollCount.textContent = "×" + g.rerolls;
        this.el.rerollBtn.disabled = g.rerolls <= 0;
      }
      // cosmetic flash-sale countdown
      this._flash = 9.0;
      clearInterval(this._flashI);
      const tick = () => {
        this._flash -= 0.1; if (this._flash <= 0) this._flash = 9.0;
        const s = Math.floor(this._flash), cs = Math.floor((this._flash % 1) * 10);
        this.el.flashTimer.textContent = "00:0" + s + "." + cs;
      };
      tick();
      this._flashI = setInterval(tick, 100);
    },

    renderOffers(g, offers) {
      const wrap = this.el.shopCards;
      wrap.innerHTML = "";
      const U = TD.Upgrades;
      offers.forEach((u) => {
        const price = U.priceFor(u);
        const have = g.ship.mods[u.id] || 0;
        const card = document.createElement("div");
        card.className = "deal r-" + u.rarity;
        const rarTag = u.rarity === "legendary" ? "DOORBUSTER" : u.rarity === "epic" ? "BEST SELLER"
          : u.rarity === "rare" ? "LIMITED" : "DEAL";
        card.innerHTML =
          '<div class="deal-tag">' + rarTag + '</div>' +
          '<div class="deal-thumb"><span style="filter:drop-shadow(0 0 10px rgba(255,255,255,.4))">' + u.icon + '</span></div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:0">' +
            '<div class="deal-dept">' + u.dept + (have ? ' · OWNED ×' + have : '') + '</div>' +
            '<div class="deal-name">' + u.name + '</div>' +
            '<div class="deal-desc">' + u.desc + '</div>' +
            '<div class="deal-meta"><span class="deal-stars">' + U.STARS[u.rarity] + '</span>' +
              '<span class="deal-sold">' + U.SOLD[u.rarity]() + '</span></div>' +
            '<div class="deal-price"><span class="price-now">FREE</span>' +
              '<span class="price-old">' + price.old + '</span>' +
              '<span class="price-off">-' + price.off + '%</span></div>' +
            (u.max > 1 ? '<div class="deal-lvl">stocks ' + have + '/' + u.max + '</div>' : '') +
            '<button class="add-cart">＋ Add to cart</button>' +
          '</div>';
        card.addEventListener("click", () => { this.closeFlash(); g.chooseUpgrade(u); });
        wrap.appendChild(card);
      });
    },
    closeFlash() { clearInterval(this._flashI); },
    closeShop() {
      this.closeFlash();
      this.el.shopScreen.classList.add("hidden");
      this.el.hud.classList.remove("hidden");
      this.el.pauseBtn.classList.remove("hidden");
      this.el.muteBtn.classList.remove("hidden");
    },

    /* ---------- toasts & banner ---------- */
    toast(msg, kind, ms) {
      ms = ms || 1150;
      const t = document.createElement("div");
      t.className = "toast" + (kind ? " " + kind : "");
      if (ms > 1150) t.classList.add("wrap");   // multi-line guidance toasts
      t.textContent = msg;
      // scale the in/hold/out animation to the requested lifetime
      t.style.animationDuration = (ms / 1000) + "s";
      this.el.toasts.appendChild(t);
      setTimeout(() => t.remove(), ms);
      // cap
      while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    },
    bossBanner(big, small) {
      const b = this.el.bossBanner;
      b.innerHTML = '<div class="bb-big">' + big + '</div><div class="bb-small">' + small + '</div>';
      b.classList.remove("hidden");
      clearTimeout(this._bossT);
      // re-trigger animation
      b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
      this._bossT = setTimeout(() => b.classList.add("hidden"), 2600);
    },

    /* ---------- PRIZE WHEEL ---------- */
    openWheel(g, prizes, kicker, opts) {
      opts = opts || {};
      this._wheel = { g, prizes, winner: null, spinning: false, done: false, locked: !!opts.locked, select: !!opts.select };
      this.el.hud.classList.add("hidden");
      this.el.pauseBtn.classList.add("hidden");
      this.el.muteBtn.classList.add("hidden");
      this.el.wheelKicker.textContent = kicker || "🎁 BOSS REWARD · MEMBERS-ONLY";
      if (this.el.wheelTitle && opts.title) this.el.wheelTitle.innerHTML = opts.title;
      if (this.el.wheelSub && opts.sub) this.el.wheelSub.innerHTML = opts.sub;
      const tr = this.el.wheelTrack;
      tr.innerHTML = "";
      tr.classList.toggle("locked", !!opts.locked);
      prizes.forEach((p, i) => {
        const own = (g.ship.prizes && g.ship.prizes[p.id]) || 0;
        const row = document.createElement("div");
        row.className = "prize"; row.dataset.i = i;
        row.innerHTML =
          '<div class="p-emoji" style="box-shadow:inset 0 0 0 2px ' + p.seg + '55">' + p.icon + '</div>' +
          '<div class="p-body"><div class="p-name">' + p.name + '</div>' +
          '<div class="p-desc">' + p.desc + '</div></div>' +
          (opts.locked ? '<div class="p-lock">🔒</div>'
                       : (own ? '<div class="p-own">OWNED ×' + own + '</div>' : ''));
        if (opts.select) {
          row.classList.add("selectable");
          row.addEventListener("click", () => { if (TD.Audio) TD.Audio.ui(); this.chooseWheel(i); });
        }
        tr.appendChild(row);
      });
      const b = this.el.spinBtn;
      const skip = this.el.wheelSkipBtn;
      b.disabled = false;
      if (opts.select) {
        // tap-to-choose: no spin button, no skip
        b.classList.add("hidden");
        if (skip) skip.classList.add("hidden");
        this.show("wheelScreen");
        return;
      }
      b.classList.remove("hidden");
      if (opts.locked) {
        b.className = "big-cta wheel-spin locked";
        b.textContent = "🔓  UNLOCK TO SPIN";
        if (skip) skip.classList.remove("hidden");
        // fill in the localized price when running inside the Play app
        if (TD.Entitlement && TD.Entitlement.price) {
          TD.Entitlement.price().then((pr) => {
            if (pr && this._wheel && this._wheel.locked) b.textContent = "🔓  UNLOCK TO SPIN · " + pr;
          });
        }
      } else {
        b.className = "big-cta wheel-spin";
        b.textContent = "🎡  SPIN TO WIN";
        if (skip) skip.classList.add("hidden");
      }
      this.show("wheelScreen");
    },
    // routed from the spin button: unlock (locked) / claim (done) / spin
    onSpin() {
      const w = this._wheel;
      if (!w) return;
      if (w.locked) { this.unlockWheel(); return; }
      if (w.done) this.claimWheel(); else this.spinWheel();
    },
    async unlockWheel() {
      const w = this._wheel;
      if (!w || !w.locked) return;
      const b = this.el.spinBtn;
      b.disabled = true; b.textContent = "… contacting store";
      let ok = false;
      try { ok = !!(TD.Entitlement && TD.Entitlement.purchase && await TD.Entitlement.purchase()); } catch (e) { ok = false; }
      if (ok) {
        // unlock in place — same ships become spinnable
        w.locked = false;
        this.el.wheelTrack.classList.remove("locked");
        [...this.el.wheelTrack.children].forEach((r) => { const l = r.querySelector(".p-lock"); if (l) l.remove(); });
        if (this.el.wheelSkipBtn) this.el.wheelSkipBtn.classList.add("hidden");
        b.className = "big-cta wheel-spin"; b.disabled = false; b.textContent = "🎡  SPIN TO WIN";
      } else {
        b.disabled = false; b.textContent = "🔓  UNLOCK TO SPIN";
        if (TD.Entitlement && TD.Entitlement.price) {
          TD.Entitlement.price().then((pr) => { if (pr && this._wheel && this._wheel.locked) b.textContent = "🔓  UNLOCK TO SPIN · " + pr; });
        }
      }
    },
    // tap-to-choose (select mode): award the tapped item immediately
    chooseWheel(i) {
      const w = this._wheel;
      if (!w || !w.select || w.done) return;
      w.done = true;
      const winner = w.prizes[i];
      this.el.wheelScreen.classList.add("hidden");
      this._wheel = null;
      w.g.awardPrize(winner);
    },
    // free players decline the unlock and launch in the default hull
    skipWheel() {
      const w = this._wheel;
      if (!w) return;
      const g = w.g;
      this.el.wheelScreen.classList.add("hidden");
      if (this.el.wheelSkipBtn) this.el.wheelSkipBtn.classList.add("hidden");
      this._wheel = null;
      g.applyBody(TD.BODIES.DEFAULT);
    },
    spinWheel() {
      const w = this._wheel;
      if (!w || w.spinning || w.done) return;
      w.spinning = true;
      this.el.spinBtn.disabled = true;
      const rows = [...this.el.wheelTrack.children];
      const n = rows.length;
      const winIdx = (Math.random() * n) | 0;
      // land so the final lit row == winIdx after ~7 full passes
      const total = winIdx + 1 + n * (6 + ((Math.random() * 3) | 0));
      let tick = 0;
      const step = () => {
        rows.forEach((r) => r.classList.remove("lit"));
        const idx = tick % n;
        rows[idx].classList.add("lit");
        if (TD.Audio) TD.Audio.ui();
        tick++;
        if (tick > total) { this.landWheel(rows, winIdx); return; }
        const prog = tick / total;
        const delay = 55 + prog * prog * 340;
        setTimeout(step, delay);
      };
      step();
    },
    landWheel(rows, winIdx) {
      const w = this._wheel;
      rows.forEach((r) => r.classList.remove("lit"));
      const row = rows[winIdx];
      row.classList.add("win");
      w.winner = w.prizes[winIdx];
      w.spinning = false; w.done = true;
      if (TD.Audio) TD.Audio.levelUp();
      const own = (w.g.ship.prizes[w.winner.id] || 0);
      const tag = own ? "STACKED ×" + (own + 1) + "!" : "NEW!";
      const b = this.el.spinBtn;
      b.className = "big-cta wheel-claim";
      b.disabled = false;
      b.textContent = "✅  CLAIM: " + w.winner.name + "  (" + tag + ")";
    },
    claimWheel() {
      const w = this._wheel;
      if (!w || !w.done || !w.winner) return;
      const winner = w.winner;
      this.el.wheelScreen.classList.add("hidden");
      this._wheel = null;
      w.g.awardPrize(winner);
    },


    gameOver(g) {
      this.el.hud.classList.add("hidden");
      this.el.pauseBtn.classList.add("hidden");
      this.el.muteBtn.classList.add("hidden");
      this.el.bossBanner.classList.add("hidden");
      const reasons = [
        "Your hull was returned to sender.",
        "Item not as described. You exploded.",
        "Delivery failed: recipient vaporised.",
        "Buyer beware. The asteroids did not.",
      ];
      const tips = [
        "Pro tip: hold &amp; circle — never fly in a straight line into a crowd.",
        "Pro tip: stack one weapon's add-ons instead of grabbing everything.",
        "Pro tip: Force Fields recharge fast — bait hits, then re-engage.",
        "Pro tip: Phantom Return Policy + a big field = very hard to kill.",
      ];
      this.el.overReason.textContent = reasons[(Math.random() * reasons.length) | 0];
      this.el.overTip.innerHTML = tips[(Math.random() * tips.length) | 0];
      const weapon = TD.WEAPONS[g.ship.stats.weapon].name;
      this.el.receipt.innerHTML =
        row("Days survived", "DAY " + g.day) +
        row("Threats neutralised", fmt(g.kills)) +
        row("Checkout level", "LVL " + g.level) +
        row("Premium Sellers refunded", "⭐ " + g.bossesBeaten) +
        row("Loadout", weapon) +
        row("Coins hoarded", fmt(g.coinTotal) + " 🪙") +
        '<div class="r-row r-tot"><b>TOTAL SAVINGS</b><b>' + fmt(g.score) + '</b></div>';
      this.show("overScreen");
      function row(a, b) { return '<div class="r-row"><span>' + a + '</span><b>' + b + '</b></div>'; }
    },
  };

  TD.UI = UI;
})();
