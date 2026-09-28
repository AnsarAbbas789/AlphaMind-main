/**
 * AlphaMind — signal-history.js  (v2 — Supabase-backed)
 * =====================================================
 * Signal History Log + Win/Loss Tracking
 * - ہر Generate Signal کا نتیجہ اب Supabase کے "signals" ٹیبل میں
 *   محفوظ ہوتا ہے (localStorage کی جگہ) — تاکہ ہر یوزر کی ٹریڈ
 *   ہسٹری کسی بھی ڈیوائس یا براؤزر سے نظر آئے، اور device بدلنے یا
 *   کیش صاف ہونے پر ضائع نہ ہو۔
 * - Live قیمت سے TP/SL ہٹ خودکار چیک ہوتا ہے
 * - "Trade History" پینل میں Win Rate کے ساتھ دکھاتا ہے
 *
 * انحصار: supabase-config.js (window.sb) پہلے لوڈ ہو چکی ہو، اور
 * Supabase میں "signals" ٹیبل + RLS پالیسیاں بن چکی ہوں
 * (دیکھیں: supabase_signal_history_setup.sql)۔
 *
 * یہ فائل کسی موجودہ فائل کو تبدیل نہیں کرتی — صرف نیا
 * window.AlphaMindHistory عالمی آبجیکٹ فراہم کرتی ہے۔
 * =====================================================
 */

"use strict";

(function () {

  var MAX_RECORDS = 200; // ایک وقت میں زیادہ سے زیادہ کتنی حالیہ ریکارڈز لائیں

  /* ================================================================
     SUPABASE HELPERS
  ================================================================ */
  function client() {
    if (typeof window.sb === "undefined") {
      throw new Error("Supabase client موجود نہیں — supabase-config.js پہلے لوڈ کریں۔");
    }
    return window.sb;
  }

  async function getUserId() {
    var res = await client().auth.getSession();
    if (res.error) throw res.error;
    var session = res.data.session;
    if (!session) throw new Error("not_logged_in");
    return session.user.id;
  }

  /**
   * rowToRecord — Supabase کی row کو پرانے localStorage والے
   * record شکل میں بدلتا ہے تاکہ باقی UI کوڈ بغیر تبدیلی کے چلے۔
   */
  function rowToRecord(r) {
    return {
      id: r.id,
      symbol: r.symbol,
      marketType: r.market_type,
      direction: r.direction,
      confidence: r.confidence || 0,
      strength: r.strength || "—",
      riskLevel: r.risk_level || "—",
      entry: +r.entry,
      stopLoss: +r.stop_loss,
      tp: [ +r.tp1 || 0, +r.tp2 || 0, +r.tp3 || 0, +r.tp4 || 0 ],
      tpHit: [ !!r.tp1_hit, !!r.tp2_hit, !!r.tp3_hit, !!r.tp4_hit ],
      slHit: !!r.sl_hit,
      leverage: r.leverage || null,
      reasoning: r.reasoning || "",
      createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      status: r.status,
      closedAt: r.closed_at ? new Date(r.closed_at).getTime() : null
    };
  }

  /**
   * saveSignal(data, symbol, marketType)
   * ai-signal-fixed.js سے AI کا جواب ملنے کے بعد بلائیں۔
   * NEUTRAL سگنلز یا بغیر entry_price والے سگنلز محفوظ نہیں ہوتے۔
   */
  async function saveSignal(data, symbol, marketType) {
    if (!data || !data.signal) return;
    if (data.signal === "NEUTRAL" || !data.entry_price) return;

    try {
      var uid = await getUserId();
      var row = {
        user_id: uid,
        symbol: symbol,
        market_type: marketType,
        direction: data.signal,
        confidence: data.confidence || 0,
        strength: data.strength || "—",
        risk_level: data.risk_level || "—",
        entry: +data.entry_price,
        stop_loss: +data.stop_loss,
        tp1: +data.take_profit_1 || 0,
        tp2: +data.take_profit_2 || 0,
        tp3: +data.take_profit_3 || 0,
        tp4: +data.take_profit_4 || 0,
        leverage: data.leverage_suggestion ? String(data.leverage_suggestion) : null,
        reasoning: data.reasoning_en || ""
      };

      var res = await client().from("signals").insert(row);
      if (res.error) throw res.error;
      console.log("[signal-history] Saved to Supabase:", symbol, data.signal, "@", row.entry);
    } catch (err) {
      console.warn("[signal-history] saveSignal failed:", err.message);
    }
  }

  /**
   * loadAll() — موجودہ لاگ ان یوزر کی حالیہ ترین ہسٹری Supabase سے لاتا ہے۔
   */
  async function loadAll() {
    try {
      var uid = await getUserId();
      var res = await client()
        .from("signals")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(MAX_RECORDS);

      if (res.error) throw res.error;
      return (res.data || []).map(rowToRecord);
    } catch (err) {
      console.warn("[signal-history] loadAll failed:", err.message);
      return [];
    }
  }

  /* ================================================================
     OUTCOME CHECKING — کھلے سگنلز کو موجودہ قیمت سے موازنہ، اور
     تبدیلی ہونے پر Supabase میں اپڈیٹ کرتا ہے۔
     priceMap مثال: { "BTCUSDT": 67890.12, "ETHUSDT": 3450.5, ... }
  ================================================================ */
  async function checkOutcomes(priceMap) {
    var list = await loadAll();
    var updates = [];

    list.forEach(function (r) {
      if (r.status !== "open") return;
      var price = priceMap[r.symbol];
      if (!price || price <= 0) return;

      var isLong = r.direction === "LONG";
      var patch = {};
      var changed = false;

      // پہلے Stop Loss چیک کریں (نقصان کو ترجیح — قدامت پسند طریقہ)
      var slHit = isLong ? price <= r.stopLoss : price >= r.stopLoss;
      if (slHit) {
        patch.sl_hit = true;
        patch.status = "loss";
        patch.closed_at = new Date().toISOString();
        changed = true;
      } else {
        // TP سطحیں یکے بعد دیگرے چیک کریں
        r.tp.forEach(function (tpPrice, idx) {
          if (!tpPrice || r.tpHit[idx]) return;
          var hit = isLong ? price >= tpPrice : price <= tpPrice;
          if (hit) {
            patch["tp" + (idx + 1) + "_hit"] = true;
            r.tpHit[idx] = true;
            changed = true;
          }
        });
        // TP4 (آخری ہدف) ہٹ ہو جائے تو مکمل win شمار ہوگا
        if (r.tpHit[3]) {
          patch.status = "win";
          patch.closed_at = new Date().toISOString();
          changed = true;
        }
      }

      if (changed) updates.push({ id: r.id, patch: patch });
    });

    for (var i = 0; i < updates.length; i++) {
      try {
        var res = await client().from("signals").update(updates[i].patch).eq("id", updates[i].id);
        if (res.error) console.warn("[signal-history] update failed:", res.error.message);
      } catch (err) {
        console.warn("[signal-history] update threw:", err.message);
      }
    }

    // تازہ ترین حالت واپس لائیں (اپڈیٹس کے بعد)
    return updates.length ? loadAll() : list;
  }

  /**
   * dashboard.html کے window.COINS array سے براہ راست قیمتیں اٹھا کر چیک کریں۔
   */
  async function checkOutcomesFromLiveData() {
    if (typeof window.COINS === "undefined" || !Array.isArray(window.COINS)) return loadAll();
    var priceMap = {};
    window.COINS.forEach(function (c) {
      if (c && c.s && c.p) priceMap[c.s] = c.p;
    });
    return checkOutcomes(priceMap);
  }

  /* ================================================================
     STATS — Win Rate کیلکولیشن
  ================================================================ */
  function computeStats(list) {
    var closed = list.filter(function (r) { return r.status !== "open"; });
    var wins = closed.filter(function (r) { return r.status === "win"; }).length;
    var losses = closed.filter(function (r) { return r.status === "loss"; }).length;
    var open = list.length - closed.length;
    var winRate = closed.length ? ((wins / closed.length) * 100).toFixed(1) : "0.0";
    return { total: list.length, open: open, wins: wins, losses: losses, winRate: winRate };
  }

  async function getStats() {
    var list = await loadAll();
    return computeStats(list);
  }

  /* ================================================================
     UI STYLES — dashboard.html کے CSS variables استعمال کرتے ہیں
     تاکہ dark/light thema خودکار میچ ہو۔
  ================================================================ */
  function injectStyles() {
    if (document.getElementById("alphamindHistoryStyles")) return;
    var css = ''
      + '.hist-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;'
      + 'display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;'
      + 'transition:opacity .25s ease;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;}'
      + '.hist-overlay.show{opacity:1;}'
      + '.hist-card{background:var(--card,#fff);color:var(--text,#1a1a1a);width:100%;max-width:820px;'
      + 'max-height:85vh;border-radius:16px;border:1px solid var(--border,#e7e9ee);'
      + 'box-shadow:0 24px 64px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;}'
      + '.hist-hdr{display:flex;align-items:center;justify-content:space-between;'
      + 'padding:18px 22px;border-bottom:1px solid var(--border,#e7e9ee);flex-shrink:0;}'
      + '.hist-title{font-size:1.05rem;font-weight:800;}'
      + '.hist-close{background:none;border:none;color:var(--text-sec,#5b6472);cursor:pointer;'
      + 'font-size:1.3rem;line-height:1;padding:4px 8px;border-radius:6px;transition:background .2s;}'
      + '.hist-close:hover{background:var(--row-hover,#f2f4f8);}'
      + '.hist-stats{display:flex;gap:10px;padding:14px 22px;border-bottom:1px solid var(--border,#e7e9ee);'
      + 'flex-wrap:wrap;flex-shrink:0;}'
      + '.hist-stat{background:var(--input-bg,#fbfbfd);border:1px solid var(--border,#e7e9ee);'
      + 'border-radius:10px;padding:8px 14px;text-align:center;flex:1;min-width:80px;}'
      + '.hist-stat b{display:block;font-size:1.1rem;font-family:"JetBrains Mono",monospace;}'
      + '.hist-stat span{font-size:.62rem;color:var(--text-sec,#5b6472);text-transform:uppercase;'
      + 'letter-spacing:.04em;}'
      + '.hist-body{overflow-y:auto;padding:6px 22px 20px;}'
      + '.hist-row{display:flex;align-items:center;gap:12px;padding:11px 0;'
      + 'border-bottom:1px solid var(--border,#e7e9ee);font-size:.8rem;flex-wrap:wrap;}'
      + '.hist-row:last-child{border-bottom:none;}'
      + '.hist-dir{font-weight:800;padding:2px 8px;border-radius:6px;font-size:.68rem;letter-spacing:.02em;}'
      + '.hist-dir.LONG{background:rgba(37,99,235,.15);color:var(--blue-sec,#2563eb);}'
      + '.hist-dir.SHORT{background:rgba(239,68,68,.15);color:var(--red,#ef4444);}'
      + '.hist-sym{font-weight:700;flex-shrink:0;min-width:70px;}'
      + '.hist-entry{color:var(--text-sec,#5b6472);font-family:"JetBrains Mono",monospace;font-size:.74rem;}'
      + '.hist-tp{color:var(--text-sec,#5b6472);font-size:.72rem;}'
      + '.hist-time{color:var(--text-sec,#5b6472);font-size:.68rem;}'
      + '.hist-status{margin-left:auto;font-weight:800;font-size:.66rem;padding:3px 10px;'
      + 'border-radius:99px;letter-spacing:.03em;}'
      + '.hist-status.open{background:rgba(212,175,55,.15);color:var(--gold-deep,#b8932a);}'
      + '.hist-status.win{background:rgba(37,99,235,.15);color:var(--blue-sec,#2563eb);}'
      + '.hist-status.loss{background:rgba(239,68,68,.15);color:var(--red,#ef4444);}'
      + '.hist-empty{text-align:center;padding:44px 10px;color:var(--text-sec,#5b6472);font-size:.85rem;}'
      + '.hist-loading{text-align:center;padding:44px 10px;color:var(--text-sec,#5b6472);font-size:.85rem;}'
      + '@media(max-width:560px){.hist-row{font-size:.75rem;}.hist-time{display:none;}}';
    var tag = document.createElement("style");
    tag.id = "alphamindHistoryStyles";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /* ================================================================
     RENDER HELPERS
  ================================================================ */
  function fmtPrice(n) {
    return n ? "$" + (+n).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function buildRowHtml(r) {
    var statusLabel = r.status === "open" ? "OPEN" : r.status === "win" ? "WIN" : "LOSS";
    var tpHitCount = r.tpHit.filter(Boolean).length;
    return ''
      + '<div class="hist-row">'
      + '  <span class="hist-sym">' + r.symbol.replace("USDT", "") + '</span>'
      + '  <span class="hist-dir ' + r.direction + '">' + r.direction + '</span>'
      + '  <span class="hist-entry">' + fmtPrice(r.entry) + '</span>'
      + '  <span class="hist-tp">TP hit: ' + tpHitCount + '/4</span>'
      + '  <span class="hist-time">' + fmtTime(r.createdAt) + '</span>'
      + '  <span class="hist-status ' + r.status + '">' + statusLabel + '</span>'
      + '</div>';
  }

  function buildCardHtml(list, stats) {
    var rowsHtml = list.length
      ? list.map(buildRowHtml).join("")
      : '<div class="hist-empty">ابھی کوئی سگنل ہسٹری موجود نہیں۔<br/>"Generate Signal" استعمال کر کے پہلا سگنل بنائیں۔</div>';

    return ''
      + '<div class="hist-overlay" id="histOverlay">'
      + '  <div class="hist-card">'
      + '    <div class="hist-hdr">'
      + '      <span class="hist-title">📊 Trade History</span>'
      + '      <button class="hist-close" id="histCloseBtn" type="button">✕</button>'
      + '    </div>'
      + '    <div class="hist-stats">'
      + '      <div class="hist-stat"><b>' + stats.total + '</b><span>Total</span></div>'
      + '      <div class="hist-stat"><b>' + stats.open + '</b><span>Open</span></div>'
      + '      <div class="hist-stat"><b>' + stats.wins + '</b><span>Wins</span></div>'
      + '      <div class="hist-stat"><b>' + stats.losses + '</b><span>Losses</span></div>'
      + '      <div class="hist-stat"><b>' + stats.winRate + '%</b><span>Win Rate</span></div>'
      + '    </div>'
      + '    <div class="hist-body">' + rowsHtml + '</div>'
      + '  </div>'
      + '</div>';
  }

  function bindCloseHandlers() {
    var closeBtn = document.getElementById("histCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    var overlayEl = document.getElementById("histOverlay");
    if (overlayEl) {
      overlayEl.addEventListener("click", function (e) {
        if (e.target.id === "histOverlay") closeModal();
      });
    }
    document.addEventListener("keydown", escCloseOnce);
  }

  function escCloseOnce(e) {
    if (e.key === "Escape") closeModal();
  }

  function closeModal() {
    var wrap = document.getElementById("historyModalRoot");
    if (wrap) wrap.remove();
    document.removeEventListener("keydown", escCloseOnce);
  }

  function renderLoadingModal() {
    injectStyles();
    var html = '<div class="hist-overlay show" id="histOverlay"><div class="hist-card">'
      + '<div class="hist-hdr"><span class="hist-title">📊 Trade History</span>'
      + '<button class="hist-close" id="histCloseBtn" type="button">✕</button></div>'
      + '<div class="hist-loading">لوڈ ہو رہا ہے… / Loading…</div>'
      + '</div></div>';

    var wrap = document.createElement("div");
    wrap.id = "historyModalRoot";
    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    document.getElementById("histCloseBtn").addEventListener("click", closeModal);
    document.addEventListener("keydown", escCloseOnce);
  }

  function renderCard(list, stats) {
    var wrap = document.getElementById("historyModalRoot");
    if (!wrap) return; // یوزر نے لوڈنگ کے دوران ہی بند کر دیا
    wrap.innerHTML = buildCardHtml(list, stats);

    requestAnimationFrame(function () {
      var overlay = document.getElementById("histOverlay");
      if (overlay) overlay.classList.add("show");
    });

    bindCloseHandlers();
  }

  /**
   * open() — سب سے پہلے لوڈنگ اسٹیٹ دکھاتا ہے، پھر موجودہ لائیو
   * قیمتوں سے outcomes تازہ کرتا ہے، اور آخر میں مکمل Modal دکھاتا
   * ہے۔ یہی فنکشن "Trade History" بٹن سے بلانا ہے۔
   */
  async function open() {
    renderLoadingModal();
    try {
      var list = await checkOutcomesFromLiveData();
      var stats = computeStats(list);
      renderCard(list, stats);
    } catch (err) {
      console.warn("[signal-history] open() failed:", err.message);
      var wrap = document.getElementById("historyModalRoot");
      if (wrap) {
        wrap.innerHTML = '<div class="hist-overlay show"><div class="hist-card">'
          + '<div class="hist-hdr"><span class="hist-title">📊 Trade History</span>'
          + '<button class="hist-close" id="histCloseBtn" type="button">✕</button></div>'
          + '<div class="hist-loading">ہسٹری لوڈ نہیں ہو سکی۔</div></div></div>';
        document.getElementById("histCloseBtn").addEventListener("click", closeModal);
      }
    }
  }

  /* ================================================================
     PUBLIC API — window.AlphaMindHistory
  ================================================================ */
  window.AlphaMindHistory = {
    saveSignal: saveSignal,
    getAll: loadAll,
    getStats: getStats,
    checkOutcomes: checkOutcomes,
    checkOutcomesFromLiveData: checkOutcomesFromLiveData,
    open: open
  };

  console.log("[AlphaMind] signal-history.js loaded — Supabase-backed history tracking ready");

})();