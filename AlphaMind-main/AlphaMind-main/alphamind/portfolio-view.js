/**
 * AlphaMind — portfolio-view.js
 * =====================================================
 * Sidebar "Portfolio" full-page view. Manual holdings tracker:
 * symbol, quantity, avg buy price — enriched with live prices from
 * exchange-api.js to compute current value and P&L, plus an SVG
 * donut chart showing allocation by current value.
 *
 * Depends on: supabase-config.js (window.sb), exchange-api.js
 * (window.AlphaMindExchange), and the `portfolio_holdings` table +
 * RLS from supabase-portfolio-setup.sql.
 *
 * Exposes: window.AlphaMindPortfolio
 *   .open() / .close()   -> lifecycle, called by switchNav()
 *   .openForm() / .closeForm() / .save()
 *   .edit(id) / .remove(id)
 * =====================================================
 */

"use strict";

(function () {

  var REFRESH_MS = 20000;
  var refreshTimer = null;
  var isViewOpen = false;

  var holdings = [];      // raw DB rows: {id, symbol, quantity, avg_buy_price, ...}
  var priceMap = {};      // { BTCUSDT: {price, change} }
  var editingId = null;

  var SLICE_COLORS = [
    "#d4af37", "#2563eb", "#1a2b4c", "#ef4444", "#e6c768",
    "#2dd4bf", "#8b5cf6", "#f97316", "#22c55e", "#ec4899"
  ];

  /* ================================================================
     LANG
  ================================================================ */
  function getLang() {
    try { return localStorage.getItem("alphamind_lang") || "en"; } catch (e) { return "en"; }
  }

  function notify(msg, type) {
    if (window.AlphaMindToast) window.AlphaMindToast.show(msg, type);
    else alert(msg);
  }

  function confirmAction(msg, opts) {
    if (window.AlphaMindToast) return window.AlphaMindToast.confirm(msg, opts);
    return Promise.resolve(confirm(msg));
  }

  function metaFor(base) {
    if (typeof window.COIN_META !== "undefined" && window.COIN_META[base]) {
      return window.COIN_META[base];
    }
    return { name: base, icon: base.charAt(0) };
  }

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

  async function loadHoldings() {
    var uid = await getUserId();
    var res = await client()
      .from("portfolio_holdings")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function insertHolding(row) {
    var uid = await getUserId();
    row.user_id = uid;
    var res = await client().from("portfolio_holdings").insert(row).select();
    if (res.error) throw res.error;
    return res.data && res.data[0];
  }

  async function updateHoldingRow(id, patch) {
    patch.updated_at = new Date().toISOString();
    var res = await client().from("portfolio_holdings").update(patch).eq("id", id);
    if (res.error) throw res.error;
  }

  async function deleteHoldingRow(id) {
    var res = await client().from("portfolio_holdings").delete().eq("id", id);
    if (res.error) throw res.error;
  }

  /* ================================================================
     PRICE SYNC
  ================================================================ */
  async function refreshPrices() {
    if (!window.AlphaMindExchange || !window.AlphaMindExchange.getAllCoins) return;
    try {
      var all = await window.AlphaMindExchange.getAllCoins();
      var map = {};
      all.forEach(function (t) { map[t.symbol] = t; });
      priceMap = map;
      if (isViewOpen) renderAll();
    } catch (err) {
      console.warn("[portfolio-view] refreshPrices failed:", err.message);
    }
  }

  /* ================================================================
     CALCULATIONS
  ================================================================ */
  function computeRows() {
    return holdings.map(function (h) {
      var t = priceMap[h.symbol];
      var currentPrice = t ? +t.price : 0;
      var qty = +h.quantity;
      var avgBuy = +h.avg_buy_price;
      var invested = qty * avgBuy;
      var value = qty * currentPrice;
      var pnl = value - invested;
      var pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      return {
        id: h.id, symbol: h.symbol, quantity: qty, avgBuy: avgBuy,
        currentPrice: currentPrice, invested: invested, value: value,
        pnl: pnl, pnlPct: pnlPct, hasPrice: !!t
      };
    });
  }

  function computeSummary(rows) {
    var totalValue = rows.reduce(function (s, r) { return s + r.value; }, 0);
    var totalInvested = rows.reduce(function (s, r) { return s + r.invested; }, 0);
    var totalPnl = totalValue - totalInvested;
    var totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    var best = null;
    rows.forEach(function (r) {
      if (r.invested <= 0) return;
      if (!best || r.pnlPct > best.pnlPct) best = r;
    });

    return { totalValue: totalValue, totalInvested: totalInvested, totalPnl: totalPnl, totalPnlPct: totalPnlPct, best: best };
  }

  /* ================================================================
     RENDER — SUMMARY
  ================================================================ */
  function fmtUsd(n) {
    return "$" + (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderSummary(rows, summary) {
    var totalValEl = document.getElementById("pfTotalValue");
    if (totalValEl) totalValEl.textContent = fmtUsd(summary.totalValue);

    var totalInvEl = document.getElementById("pfTotalInvested");
    if (totalInvEl) totalInvEl.textContent = fmtUsd(summary.totalInvested);

    var pnlEl = document.getElementById("pfTotalPnl");
    var pnlPctEl = document.getElementById("pfTotalPnlPct");
    if (pnlEl) {
      var up = summary.totalPnl >= 0;
      pnlEl.textContent = (up ? "+" : "") + fmtUsd(summary.totalPnl);
      pnlEl.className = "pf-sum-val " + (up ? "up" : "dn");
      if (pnlPctEl) pnlPctEl.textContent = (up ? "+" : "") + summary.totalPnlPct.toFixed(2) + "%";
    }

    var bestEl = document.getElementById("pfBestPerformer");
    var bestPctEl = document.getElementById("pfBestPerformerPct");
    if (bestEl) {
      if (summary.best) {
        bestEl.textContent = summary.best.symbol.replace("USDT", "");
        if (bestPctEl) {
          var bup = summary.best.pnlPct >= 0;
          bestPctEl.textContent = (bup ? "+" : "") + summary.best.pnlPct.toFixed(2) + "%";
          bestPctEl.style.color = bup ? "var(--blue-sec)" : "var(--red)";
        }
      } else {
        bestEl.textContent = "—";
        if (bestPctEl) { bestPctEl.textContent = "—"; bestPctEl.style.color = ""; }
      }
    }
  }

  /* ================================================================
     RENDER — TABLE
  ================================================================ */
  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderTable(rows) {
    var tbody = document.getElementById("pfTableBody");
    if (!tbody) return;

    if (!rows.length) {
      var lang = getLang();
      var msg = lang === "ur"
        ? "ابھی کوئی ہولڈنگ شامل نہیں۔ \"ہولڈنگ شامل کریں\" سے شروع کریں۔"
        : "No holdings yet. Start with \"Add Holding\".";
      tbody.innerHTML = '<tr><td colspan="6"><div class="vp-empty">' + msg + '</div></td></tr>';
      return;
    }

    var lang = getLang();
    var editLbl = lang === "ur" ? "ترمیم" : "Edit";
    var delLbl  = lang === "ur" ? "حذف کریں" : "Delete";

    tbody.innerHTML = rows.map(function (r) {
      var base = r.symbol.replace("USDT", "");
      var meta = metaFor(base);
      var up = r.pnl >= 0;
      return '<tr>'
        + '  <td>'
        + '    <div class="pf-coin-cell">'
        + '      <div class="pf-cion">' + escapeHtml(meta.icon || base.charAt(0)) + '</div>'
        + '      <div>'
        + '        <div class="pf-csym">' + escapeHtml(base) + '</div>'
        + '        <div class="pf-cqty">' + r.quantity + ' ' + escapeHtml(base) + '</div>'
        + '      </div>'
        + '    </div>'
        + '  </td>'
        + '  <td class="num">' + fmtUsd(r.avgBuy) + '</td>'
        + '  <td class="num">' + (r.hasPrice ? fmtUsd(r.currentPrice) : "—") + '</td>'
        + '  <td class="num">' + fmtUsd(r.value) + '</td>'
        + '  <td class="num pf-pnl ' + (up ? "up" : "dn") + '">' + (up ? "+" : "") + fmtUsd(r.pnl)
        + '    <div style="font-size:.65rem;font-weight:600;">' + (up ? "+" : "") + r.pnlPct.toFixed(2) + '%</div>'
        + '  </td>'
        + '  <td>'
        + '    <div class="pf-actions">'
        + '      <span class="pf-action" onclick="window.AlphaMindPortfolio.edit(\'' + r.id + '\')">' + editLbl + '</span>'
        + '      <span class="pf-action danger" onclick="window.AlphaMindPortfolio.remove(\'' + r.id + '\')">' + delLbl + '</span>'
        + '    </div>'
        + '  </td>'
        + '</tr>';
    }).join("");
  }

  /* ================================================================
     RENDER — DONUT CHART + LEGEND
  ================================================================ */
  function renderDonut(rows, summary) {
    var svg = document.getElementById("pfDonutSvg");
    var legend = document.getElementById("pfLegend");
    if (!svg || !legend) return;

    var total = summary.totalValue;
    var cx = 50, cy = 50, r = 38, strokeW = 14;
    var circumference = 2 * Math.PI * r;

    if (!total || !rows.length) {
      svg.innerHTML = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" '
        + 'stroke="var(--border)" stroke-width="' + strokeW + '"/>';
      var lang = getLang();
      legend.innerHTML = '<div class="vp-empty" style="padding:12px 0;">'
        + (lang === "ur" ? "ڈیٹا دستیاب نہیں" : "No allocation data") + '</div>';
      return;
    }

    var sorted = rows.slice().sort(function (a, b) { return b.value - a.value; });
    var offsetAccum = 0;
    var circles = "";
    var legendHtml = "";

    sorted.forEach(function (r, i) {
      var pct = total > 0 ? r.value / total : 0;
      var dash = circumference * pct;
      var color = SLICE_COLORS[i % SLICE_COLORS.length];

      circles += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" '
        + 'stroke="' + color + '" stroke-width="' + strokeW + '" '
        + 'stroke-dasharray="' + dash.toFixed(2) + ' ' + (circumference - dash).toFixed(2) + '" '
        + 'stroke-dashoffset="' + (-offsetAccum).toFixed(2) + '" '
        + 'transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-linecap="butt"/>';

      offsetAccum += dash;

      legendHtml += '<div class="pf-legend-row">'
        + '  <span class="pf-legend-dot" style="background:' + color + '"></span>'
        + '  <span class="pf-legend-sym">' + escapeHtml(r.symbol.replace("USDT", "")) + '</span>'
        + '  <span class="pf-legend-pct">' + (pct * 100).toFixed(1) + '%</span>'
        + '</div>';
    });

    svg.innerHTML = circles;
    legend.innerHTML = legendHtml;
  }

  /* ================================================================
     RENDER ALL
  ================================================================ */
  function renderAll() {
    var rows = computeRows();
    var summary = computeSummary(rows);
    renderSummary(rows, summary);
    renderTable(rows);
    renderDonut(rows, summary);
  }

  function renderLoading() {
    var tbody = document.getElementById("pfTableBody");
    if (!tbody) return;
    var rows = "";
    for (var i = 0; i < 4; i++) {
      rows += '<tr>'
        + '<td><div class="pf-coin-cell"><div class="pf-cion" style="background:var(--input-bg);"></div><div><div class="am-skel-row" style="width:60px;margin-bottom:5px;"></div><div class="am-skel-row" style="width:80px;height:10px;"></div></div></div></td>'
        + '<td class="num"><div class="am-skel-row" style="width:60px;margin-inline-start:auto;"></div></td>'
        + '<td class="num"><div class="am-skel-row" style="width:60px;margin-inline-start:auto;"></div></td>'
        + '<td class="num"><div class="am-skel-row" style="width:70px;margin-inline-start:auto;"></div></td>'
        + '<td class="num"><div class="am-skel-row" style="width:60px;margin-inline-start:auto;"></div></td>'
        + '<td><div class="am-skel-row" style="width:70px;"></div></td>'
        + '</tr>';
    }
    tbody.innerHTML = rows;
  }

  function renderLoadFailed() {
    var tbody = document.getElementById("pfTableBody");
    if (!tbody) return;
    var lang = getLang();
    tbody.innerHTML = '<tr><td colspan="6"><div class="vp-empty">' + (lang === "ur" ? "پورٹ فولیو لوڈ نہیں ہو سکا۔" : "Could not load portfolio.") + '</div></td></tr>';
  }

  /* ================================================================
     FORM
  ================================================================ */
  function openForm() {
    var form = document.getElementById("pfForm");
    if (!form) return;
    form.classList.add("open");
    document.getElementById("pfSymbol").focus();
  }

  function closeForm() {
    var form = document.getElementById("pfForm");
    if (form) form.classList.remove("open");
    editingId = null;
    ["pfSymbol", "pfQuantity", "pfAvgPrice"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  function edit(id) {
    var h = holdings.find(function (x) { return x.id === id; });
    if (!h) return;
    editingId = id;
    document.getElementById("pfSymbol").value = h.symbol;
    document.getElementById("pfQuantity").value = h.quantity;
    document.getElementById("pfAvgPrice").value = h.avg_buy_price;
    openForm();
  }

  async function remove(id) {
    var lang = getLang();
    var ok = confirm(lang === "ur" ? "کیا آپ واقعی یہ ہولڈنگ حذف کرنا چاہتے ہیں؟" : "Delete this holding?");
    if (!ok) return;
    try {
      await deleteHoldingRow(id);
      holdings = holdings.filter(function (h) { return h.id !== id; });
      renderAll();
    } catch (err) {
      console.warn("[portfolio-view] delete failed:", err.message);
      alert(lang === "ur" ? "حذف کرنے میں خرابی ہوئی۔" : "Failed to delete holding.");
    }
  }

  async function save() {
    var lang = getLang();
    var symbol = document.getElementById("pfSymbol").value.trim().toUpperCase();
    var quantity = parseFloat(document.getElementById("pfQuantity").value);
    var avgPrice = parseFloat(document.getElementById("pfAvgPrice").value);

    if (!symbol) { alert(lang === "ur" ? "براہ کرم کوائن درج کریں۔" : "Please enter a coin symbol."); return; }
    if (!symbol.endsWith("USDT")) symbol = symbol + "USDT";
    if (!quantity || quantity <= 0) { alert(lang === "ur" ? "براہ کرم درست مقدار درج کریں۔" : "Please enter a valid quantity."); return; }
    if (isNaN(avgPrice) || avgPrice < 0) { alert(lang === "ur" ? "براہ کرم درست قیمت درج کریں۔" : "Please enter a valid price."); return; }

    var saveBtn = document.getElementById("pfSaveBtn");
    if (saveBtn) saveBtn.disabled = true;

    try {
      if (editingId) {
        await updateHoldingRow(editingId, { symbol: symbol, quantity: quantity, avg_buy_price: avgPrice });
        var idx = holdings.findIndex(function (h) { return h.id === editingId; });
        if (idx !== -1) {
          holdings[idx].symbol = symbol;
          holdings[idx].quantity = quantity;
          holdings[idx].avg_buy_price = avgPrice;
        }
      } else {
        var created = await insertHolding({ symbol: symbol, quantity: quantity, avg_buy_price: avgPrice });
        if (created) holdings.push(created);
      }

      closeForm();
      await refreshPrices();
      renderAll();
    } catch (err) {
      console.warn("[portfolio-view] save failed:", err.message);
      alert(lang === "ur" ? "محفوظ کرنے میں خرابی ہوئی۔" : "Failed to save holding.");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  /* ================================================================
     PUBLIC API
  ================================================================ */
  function open() {
    isViewOpen = true;
    renderLoading();

    loadHoldings()
      .then(function (list) {
        if (!isViewOpen) return;
        holdings = list;
        return refreshPrices();
      })
      .then(function () {
        if (!isViewOpen) return;
        renderAll();
      })
      .catch(function (err) {
        console.warn("[portfolio-view] open failed:", err.message);
        if (isViewOpen) renderLoadFailed();
      });

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (isViewOpen) refreshPrices();
    }, REFRESH_MS);
  }

  function close() {
    isViewOpen = false;
    closeForm();
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  window.AlphaMindPortfolio = {
    open: open,
    close: close,
    openForm: openForm,
    closeForm: closeForm,
    save: save,
    edit: edit,
    remove: remove
  };

  console.log("[AlphaMind] portfolio-view.js loaded — Portfolio view ready");

})();