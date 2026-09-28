/**
 * AlphaMind — live-scanner.js
 * =====================================================
 * Reads the FastAPI backend's background Live Scanner results
 * (GET /api/scan-results) every ~45 seconds. This is READ-ONLY —
 * the backend does all the work (candle fetching, indicator
 * checks) in its own background loop every 5 minutes; this file
 * only polls the already-computed results and reflects them in
 * the UI. No new candles are fetched from here.
 *
 * Renders:
 *   1. A small colored dot on each watchlist coin's icon
 *      (grey=WATCHING, gold=BUILDING, orange=HOT, green/red=SIGNAL)
 *   2. A "Confluence Checklist" card for the currently charted coin
 *   3. A bell notification (red dot + chime) the first time any
 *      coin's state flips to SIGNAL, with a dropdown of recent signals
 *   4. A real OS-level browser push notification (Notification API)
 *      on the same SIGNAL transition, so alerts land even when the
 *      AlphaMind tab is in the background or minimized
 *
 * Depends on: supabase-config.js (window.sb) for the access token,
 * and dashboard.html's globals (renderCoinList, selectCoin,
 * currentSymbol, goToDashboardWithCoin) which this file wraps
 * non-destructively (same pattern already used by market-data.js
 * for renderNews/renderFearGreed).
 * =====================================================
 */

"use strict";

(function () {

  var POLL_MS = 45000;    // 30-60s window per spec
  var TIMEOUT_MS = 15000;
  var pollTimer = null;

  var latestResults = {};     // symbol -> scan result object
  var previousStates = {};    // symbol -> last known state (to detect NEW signal transitions)
  var notifications = [];     // recent SIGNAL events: {symbol, direction, time}
  var audioCtx = null;

  // localStorage flag so we only ever ask for OS notification permission
  // once, instead of re-prompting the user on every bell click.
  var NOTIF_PERMISSION_ASKED_KEY = "alphamind_notif_permission_asked";

  /* ================================================================
     LANG
  ================================================================ */
  function getLang() {
    try { return localStorage.getItem("alphamind_lang") || "en"; } catch (e) { return "en"; }
  }

  /* ================================================================
     AUTH + FETCH
  ================================================================ */
  function withTimeout(promise) {
    var timer = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error("timeout")); }, TIMEOUT_MS);
    });
    return Promise.race([promise, timer]);
  }

  async function getAccessToken() {
    if (typeof window.sb === "undefined") throw new Error("supabase_client_missing");
    var result = await window.sb.auth.getSession();
    if (result.error) throw result.error;
    var session = result.data && result.data.session;
    if (!session || !session.access_token) throw new Error("not_logged_in");
    return session.access_token;
  }

  function fetchScanResults() {
    var endpoint = (typeof CONFIG !== "undefined") ? CONFIG.SCAN_RESULTS_ENDPOINT : null;
    if (!endpoint) return Promise.reject(new Error("no_scan_endpoint_configured"));

    return getAccessToken().then(function (token) {
      return withTimeout(fetch(endpoint, {
        headers: { "Authorization": "Bearer " + token }
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (d) {
          if (!res.ok) throw new Error("http_" + res.status);
          return d;
        });
      }));
    });
  }

  /* ================================================================
     WATCHLIST DOTS
  ================================================================ */
  var STATE_COLORS = {
    WATCHING: "#9aa4b5",
    BUILDING: "#d4af37",
    HOT: "#f97316",
    ERROR: "#6b7280"
  };

  function dotColorFor(result) {
    if (!result) return "#6b7280";
    if (result.state === "SIGNAL") {
      return result.direction_lean === "SHORT" ? "#ef4444" : "#22c55e";
    }
    return STATE_COLORS[result.state] || "#6b7280";
  }

  function applyDotsToSidebar() {
    document.querySelectorAll("#coinList .crow[data-symbol]").forEach(function (row) {
      var sym = row.getAttribute("data-symbol");
      var result = latestResults[sym];
      var cion = row.querySelector(".cion");
      if (!cion) return;

      var dot = cion.querySelector(".scan-dot");
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "scan-dot";
        cion.appendChild(dot);
      }
      var color = dotColorFor(result);
      dot.style.background = color;
      dot.title = result ? (result.state + (result.direction_lean ? " · " + result.direction_lean : "")) : "";

      var isSignal = result && result.state === "SIGNAL";
      dot.classList.toggle("scan-pulse", !!isSignal);
      if (isSignal) {
        dot.style.setProperty("--pulse-color", result.direction_lean === "SHORT" ? "rgba(239,68,68,.5)" : "rgba(34,197,94,.5)");
      }
    });
  }

  // Re-apply dots every time the sidebar re-renders (e.g. the existing
  // 20s price refresh in dashboard.html rebuilds #coinList's innerHTML,
  // which would otherwise wipe our injected dots).
  if (typeof window.renderCoinList === "function") {
    var _origRenderCoinList = window.renderCoinList;
    window.renderCoinList = function (filter) {
      _origRenderCoinList(filter);
      applyDotsToSidebar();
    };
  }

  /* ================================================================
     CONFLUENCE CHECKLIST PANEL
  ================================================================ */
  var CHECKLIST_ORDER = ["trend_strength", "bias_score", "mtf_aligned", "volume_confirmed", "entry_timing"];
  var CHECKLIST_LABELS = {
    trend_strength:   { en: "Trend Strength (ADX)",     ur: "رجحان کی طاقت (ADX)" },
    bias_score:       { en: "Bias Score",                ur: "بایاس اسکور" },
    mtf_aligned:      { en: "Multi-Timeframe Aligned",   ur: "ملٹی ٹائم فریم موافقت" },
    volume_confirmed: { en: "Volume Confirmed",          ur: "والیوم کی تصدیق" },
    entry_timing:     { en: "Entry Timing",              ur: "انٹری ٹائمنگ" }
  };
  var STATE_LABELS = {
    WATCHING: { en: "Watching",     ur: "نظر رکھے ہوئے" },
    BUILDING: { en: "Building",     ur: "رجحان بن رہا ہے" },
    HOT:      { en: "Hot",          ur: "گرم" },
    SIGNAL:   { en: "Signal Ready", ur: "سگنل تیار" },
    ERROR:    { en: "Error",        ur: "خرابی" }
  };
  var STATE_BADGE_CLASS = { WATCHING: "watching", BUILDING: "building", HOT: "hot", SIGNAL: "signal", ERROR: "error" };

  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderConfluencePanel() {
    var badge = document.getElementById("confStateBadge");
    var progress = document.getElementById("confProgress");
    var list = document.getElementById("confChecklist");
    var noteEl = document.getElementById("confEntryNote");
    if (!badge || !list) return;

    var sym = window.currentSymbol || "BTCUSDT";
    var result = latestResults[sym];
    var lang = getLang();

    if (!result) {
      badge.textContent = "—";
      badge.className = "conf-state-badge";
      if (progress) progress.textContent = "—";
      list.innerHTML = '<div class="conf-empty">' + (lang === "ur" ? "ابھی ڈیٹا دستیاب نہیں۔" : "No scan data yet.") + '</div>';
      if (noteEl) noteEl.textContent = "";
      return;
    }

    var stLabel = STATE_LABELS[result.state] || { en: result.state, ur: result.state };
    badge.textContent = (lang === "ur" ? stLabel.ur : stLabel.en) + (result.direction_lean ? " · " + result.direction_lean : "");
    var badgeClass = "conf-state-badge " + (STATE_BADGE_CLASS[result.state] || "");
    if (result.state === "SIGNAL") {
      badgeClass += result.direction_lean === "SHORT" ? " dir-short" : " dir-long";
    }
    badge.className = badgeClass;

    if (progress) progress.textContent = (result.checklist_passed != null ? result.checklist_passed : "—") + "/" + (result.checklist_total != null ? result.checklist_total : 5);

    var checklist = result.checklist || {};
    list.innerHTML = CHECKLIST_ORDER.map(function (key) {
      var passed = !!checklist[key];
      var lbl = CHECKLIST_LABELS[key];
      return '<div class="conf-row">'
        + '<span class="conf-icon">' + (passed ? "✅" : "❌") + '</span>'
        + '<span class="conf-lbl">' + escapeHtml(lang === "ur" ? lbl.ur : lbl.en) + '</span>'
        + '</div>';
    }).join("");

    if (noteEl) noteEl.textContent = result.entry_timing_note || "";
  }

  // Re-render the panel whenever the user switches the charted coin.
  if (typeof window.selectCoin === "function") {
    var _origSelectCoin = window.selectCoin;
    window.selectCoin = function (sym) {
      _origSelectCoin(sym);
      renderConfluencePanel();
    };
  }

  /* ================================================================
     BELL NOTIFICATIONS (in-app dropdown + chime)
  ================================================================ */
  function playChime() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var t = audioCtx.currentTime;
      [880, 1320].forEach(function (freq, i) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, t + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.15, t + i * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.25);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t + i * 0.14);
        osc.stop(t + i * 0.14 + 0.3);
      });
    } catch (e) {
      console.warn("[live-scanner] chime failed:", e.message);
    }
  }

  function showBellDot() {
    var dot = document.getElementById("notifBellDot");
    if (dot) dot.style.display = "block";
  }
  function clearBellDot() {
    var dot = document.getElementById("notifBellDot");
    if (dot) dot.style.display = "none";
  }

  function renderNotifDropdown() {
    var panel = document.getElementById("notifDropdown");
    if (!panel) return;
    var lang = getLang();

    if (!notifications.length) {
      panel.innerHTML = '<div class="notif-empty">' + (lang === "ur" ? "ابھی کوئی نیا سگنل نہیں۔" : "No new signals yet.") + '</div>';
      return;
    }

    panel.innerHTML = notifications.slice(0, 10).map(function (n) {
      var up = n.direction !== "SHORT";
      return '<div class="notif-item" onclick="window.goToDashboardWithCoin && window.goToDashboardWithCoin(\'' + n.symbol + '\')">'
        + '  <span class="notif-dir ' + (up ? "up" : "dn") + '">' + escapeHtml(n.direction) + '</span>'
        + '  <span class="notif-sym">' + escapeHtml(n.symbol.replace("USDT", "")) + '</span>'
        + '  <span class="notif-time">' + new Date(n.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + '</span>'
        + '</div>';
    }).join("");
  }

  function toggleNotifDropdown() {
    // First-ever bell interaction is also our (single) chance to ask
    // for OS notification permission via a real user gesture.
    ensureNotificationPermission();

    var panel = document.getElementById("notifDropdown");
    if (!panel) return;
    var willShow = panel.style.display !== "block";
    panel.style.display = willShow ? "block" : "none";
    if (willShow) {
      renderNotifDropdown();
      clearBellDot();
    }
  }

  document.addEventListener("click", function (e) {
    var panel = document.getElementById("notifDropdown");
    var btn = document.getElementById("notifBellBtn");
    if (!panel || panel.style.display !== "block") return;
    if (panel.contains(e.target)) return;
    if (btn && btn.contains(e.target)) return;
    panel.style.display = "none";
  });

  /* ================================================================
     OS-LEVEL BROWSER PUSH NOTIFICATIONS (Notification API)
     ----------------------------------------------------------------
     Separate from the in-app bell above — this uses the browser's
     native Notification API so an alert can appear even if the
     AlphaMind tab is minimized or in a background tab. Permission is
     asked at most once (see toggleNotifDropdown()); after that we
     only check window.Notification.permission, never re-prompt.
  ================================================================ */
  function ensureNotificationPermission() {
    if (typeof Notification === "undefined") return; // browser doesn't support it — silently skip
    if (Notification.permission === "granted" || Notification.permission === "denied") return; // already decided

    var alreadyAsked = false;
    try { alreadyAsked = localStorage.getItem(NOTIF_PERMISSION_ASKED_KEY) === "true"; } catch (e) {}
    if (alreadyAsked) return; // don't nag again — user can still change it from browser settings

    try { localStorage.setItem(NOTIF_PERMISSION_ASKED_KEY, "true"); } catch (e) {}
    try { Notification.requestPermission(); } catch (e) {
      console.warn("[live-scanner] Notification.requestPermission() failed:", e.message);
    }
  }

  function showBrowserNotification(sym, direction) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    try {
      var lang = getLang();
      var title = lang === "ur" ? "AlphaMind سگنل" : "AlphaMind Signal";
      var coinLabel = sym.replace("USDT", "");
      var body = lang === "ur"
        ? (coinLabel + " — " + direction + " سگنل تیار ہے")
        : (coinLabel + " — " + direction + " signal ready");

      var n = new Notification(title, {
        body: body,
        icon: "/favicon.ico", // AlphaMind کا اپنا icon path ہو تو یہاں بدل دیں
        tag: "alphamind-signal-" + sym // same coin کی پرانی notification کو overwrite کرے، ڈھیر نہ بنے
      });

      n.onclick = function () {
        window.focus();
        if (window.goToDashboardWithCoin) window.goToDashboardWithCoin(sym);
        n.close();
      };
    } catch (e) {
      console.warn("[live-scanner] showBrowserNotification() failed:", e.message);
    }
  }

  // Also try once right after login (a genuine click elsewhere on the
  // page around this time can count as a user gesture in some browsers);
  // ensureNotificationPermission()'s own "already asked" guard keeps
  // this from ever double-prompting alongside the bell-click path above.
  document.addEventListener("alphamind:authReady", function () {
    ensureNotificationPermission();
  });

  /* ================================================================
     POLL CYCLE
  ================================================================ */
  function processResults(data) {
    if (!data || !data.results) return;
    var results = data.results;
    var firstRun = Object.keys(previousStates).length === 0;

    Object.keys(results).forEach(function (sym) {
      var r = results[sym];
      var prevState = previousStates[sym];

      // Only notify on a genuine transition into SIGNAL — never on the
      // very first poll after page load (that would fire for anything
      // that was already SIGNAL before the user even opened the page).
      if (r.state === "SIGNAL" && prevState !== "SIGNAL" && !firstRun) {
        var direction = r.direction_lean || (r.full_signal && r.full_signal.signal) || "LONG";
        notifications.unshift({ symbol: sym, direction: direction, time: Date.now() });
        notifications = notifications.slice(0, 20);
        showBellDot();
        playChime();
        showBrowserNotification(sym, direction);
      }
      previousStates[sym] = r.state;
    });

    latestResults = results;
    applyDotsToSidebar();
    renderConfluencePanel();
  }

  function poll() {
    fetchScanResults()
      .then(processResults)
      .catch(function (err) {
        console.warn("[live-scanner] scan-results fetch failed:", err.message);
      });
  }

  function start() {
    poll();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(poll, POLL_MS);
  }

  window.AlphaMindScanner = {
    start: start,
    toggleNotifDropdown: toggleNotifDropdown,
    getResult: function (sym) { return latestResults[sym]; }
  };

  // Start only once the user's session is confirmed (auth-guard.js
  // dispatches this after verifying login) — never poll a protected
  // endpoint before we know the user is authenticated.
  document.addEventListener("alphamind:authReady", function () {
    start();
  });

  console.log("[AlphaMind] live-scanner.js loaded — Live Scanner polling + browser push notifications ready");

})();