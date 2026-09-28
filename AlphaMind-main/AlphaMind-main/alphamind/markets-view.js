/**
 * AlphaMind — markets-view.js
 * =====================================================
 * Sidebar "Markets" full-page view. Lists ALL USDT pairs from the
 * active exchange (via exchange-api.js's getAllCoins()) with
 * search + sortable columns. Clicking a row jumps back to the
 * Dashboard view with that coin selected.
 *
 * Depends on: exchange-api.js (window.AlphaMindExchange), and
 * dashboard.html's inline script for goToDashboardWithCoin() and
 * COIN_META (both are top-level globals in dashboard.html).
 *
 * Does not modify any existing file's logic — only reads globals
 * that already exist and exposes window.AlphaMindMarkets.
 * =====================================================
 */

"use strict";

(function () {

  var REFRESH_MS = 20000;
  var refreshTimer = null;
  var isViewOpen = false;

  var allCoins = [];       // raw list from getAllCoins(): [{symbol, price, change, volume}]
  var filterText = "";
  var sortField = "volume";
  var sortDir = "desc";    // "asc" | "desc"

  /* ================================================================
     LANG
  ================================================================ */
  function getLang() {
    try { return localStorage.getItem("alphamind_lang") || "en"; } catch (e) { return "en"; }
  }

  /* ================================================================
     COIN META — reuse dashboard.html's COIN_META map when present,
     otherwise fall back to a generic icon/name derived from symbol.
  ================================================================ */
  function metaFor(base) {
    if (typeof window.COIN_META !== "undefined" && window.COIN_META[base]) {
      return window.COIN_META[base];
    }
    return { name: base, icon: base.charAt(0) };
  }

  /* ================================================================
     FETCH
  ================================================================ */
  function fetchCoins() {
    if (!window.AlphaMindExchange || !window.AlphaMindExchange.getAllCoins) {
      renderEmpty();
      return Promise.resolve();
    }
    return window.AlphaMindExchange.getAllCoins()
      .then(function (list) {
        allCoins = Array.isArray(list) ? list : [];
        render();
      })
      .catch(function (err) {
        console.warn("[markets-view] fetchCoins failed:", err.message);
        renderEmpty();
      });
  }

  /* ================================================================
     FILTER + SORT
  ================================================================ */
  function getVisibleRows() {
    var rows = allCoins.slice();

    if (filterText) {
      var q = filterText.toLowerCase();
      rows = rows.filter(function (c) {
        var base = c.symbol.replace("USDT", "");
        var meta = metaFor(base);
        return c.symbol.toLowerCase().indexOf(q) !== -1 ||
               base.toLowerCase().indexOf(q) !== -1 ||
               (meta.name || "").toLowerCase().indexOf(q) !== -1;
      });
    }

    rows.sort(function (a, b) {
      var va, vb;
      if (sortField === "symbol") { va = a.symbol; vb = b.symbol; }
      else { va = +a[sortField] || 0; vb = +b[sortField] || 0; }

      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }

  /* ================================================================
     RENDER
  ================================================================ */
  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmtPrice(n) {
    return "$" + (+n || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function fmtVolume(n) {
    n = +n || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(2);
  }

  function render() {
    var tbody = document.getElementById("marketsTableBody");
    if (!tbody) return;

    var rows = getVisibleRows();

    if (!rows.length) {
      renderEmpty();
      return;
    }

    tbody.innerHTML = rows.map(function (c) {
      var base = c.symbol.replace("USDT", "");
      var meta = metaFor(base);
      var up = (+c.change || 0) >= 0;
      var inWatch = window.AlphaMindWatchlist && window.AlphaMindWatchlist.has(c.symbol);

      return '<tr>'
        + '  <td class="vp-star-cell" onclick="event.stopPropagation();window.AlphaMindWatchlist && window.AlphaMindWatchlist.toggle(\'' + c.symbol + '\');window.AlphaMindMarkets.rerender();">'
        + '    <button class="vp-star-btn' + (inWatch ? ' act' : '') + '" title="Watchlist" type="button">'
        + '      <svg viewBox="0 0 24 24" fill="' + (inWatch ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
        + '    </button>'
        + '  </td>'
        + '  <td onclick="window.goToDashboardWithCoin && window.goToDashboardWithCoin(\'' + c.symbol + '\')">'
        + '    <div class="vp-coin-cell">'
        + '      <div class="vp-cion">' + escapeHtml(meta.icon || base.charAt(0)) + '</div>'
        + '      <div>'
        + '        <div class="vp-csym">' + escapeHtml(base) + '</div>'
        + '        <div class="vp-cname">' + escapeHtml(meta.name || base) + '</div>'
        + '      </div>'
        + '    </div>'
        + '  </td>'
        + '  <td class="num" onclick="window.goToDashboardWithCoin && window.goToDashboardWithCoin(\'' + c.symbol + '\')">' + fmtPrice(c.price) + '</td>'
        + '  <td class="num vp-chg ' + (up ? "up" : "dn") + '" onclick="window.goToDashboardWithCoin && window.goToDashboardWithCoin(\'' + c.symbol + '\')">' + (up ? "▲ +" : "▼ ") + (+c.change || 0).toFixed(2) + '%</td>'
        + '  <td class="num" onclick="window.goToDashboardWithCoin && window.goToDashboardWithCoin(\'' + c.symbol + '\')">' + fmtVolume(c.volume) + '</td>'
        + '</tr>';
    }).join("");
  }

  function renderEmpty() {
    var tbody = document.getElementById("marketsTableBody");
    if (!tbody) return;
    var lang = getLang();
    var msg = lang === "ur" ? "کوئی کوائن نہیں ملا۔" : "No coins found.";
    tbody.innerHTML = '<tr><td colspan="5"><div class="vp-empty">' + msg + '</div></td></tr>';
  }

  /* ================================================================
     PUBLIC API
  ================================================================ */
  function renderSkeleton() {
    var tbody = document.getElementById("marketsTableBody");
    if (!tbody) return;
    var rows = "";
    for (var i = 0; i < 8; i++) {
      rows += '<tr>'
        + '<td class="vp-star-cell"></td>'
        + '<td><div class="vp-coin-cell"><div class="vp-cion"></div><div><div class="am-skel-row" style="width:70px;margin-bottom:5px;"></div><div class="am-skel-row" style="width:90px;height:10px;"></div></div></div></td>'
        + '<td class="num"><div class="am-skel-row" style="width:70px;margin-inline-start:auto;"></div></td>'
        + '<td class="num"><div class="am-skel-row" style="width:50px;margin-inline-start:auto;"></div></td>'
        + '<td class="num"><div class="am-skel-row" style="width:60px;margin-inline-start:auto;"></div></td>'
        + '</tr>';
    }
    tbody.innerHTML = rows;
  }

  function open() {
    isViewOpen = true;
    if (!allCoins.length) renderSkeleton();
    fetchCoins();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (isViewOpen) fetchCoins();
    }, REFRESH_MS);
  }

  function close() {
    isViewOpen = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function filter(v) {
    filterText = v || "";
    render();
  }

  function sortBy(field) {
    if (sortField === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDir = field === "symbol" ? "asc" : "desc";
    }
    render();
  }

  window.AlphaMindMarkets = {
    open: open,
    close: close,
    filter: filter,
    sortBy: sortBy,
    refresh: fetchCoins,
    rerender: render
  };

  console.log("[AlphaMind] markets-view.js loaded — Markets view ready");

})();