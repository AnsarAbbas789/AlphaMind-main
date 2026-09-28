/**
 * AlphaMind — market-data.js
 * =====================================================
 * News + Fear & Greed Index — both real, both free.
 *
 * News source order (no key required to get SOMETHING working):
 *   1. NewsAPI.org   — if CONFIG.NEWSAPI_KEY is set (free key from
 *                       https://newsapi.org). NOTE: NewsAPI's free
 *                       "Developer" plan only allows browser (CORS)
 *                       requests from localhost — it will 426/CORS-fail
 *                       once the dashboard is deployed live. Fine for
 *                       local VS Code testing.
 *   2. CryptoCompare News — free, no key, CORS-enabled, works both
 *                       locally and once deployed. Used automatically
 *                       whenever NewsAPI is unavailable or blocked.
 *   3. Reddit r/CryptoCurrency — last-resort fallback, no key needed.
 *
 * Fear & Greed source: Alternative.me — completely free, no key,
 * no CORS restrictions, works everywhere.
 *
 * ⚠️ This file runs independently of ai-signal.js — it does NOT
 * touch the manual-trigger-only AI signal engine.
 * =====================================================
 */

(function () {
  "use strict";

  var NEWS_REFRESH_MS = 5 * 60 * 1000;   // news: every 5 minutes
  var FNG_REFRESH_MS   = 10 * 60 * 1000; // fear & greed: every 10 minutes (it only updates daily anyway)
  var TIMEOUT_MS = 10000;

  /* ═══════════════════════════════════════════════
     Helpers
     ═══════════════════════════════════════════════ */
  function fetchWithTimeout(url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("timeout")); }, TIMEOUT_MS);
      fetch(url, opts)
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) { reject(new Error("HTTP " + r.status)); return; }
          resolve(r.json());
        })
        .catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function getLang() {
    try { return localStorage.getItem("alphamind_lang") || "en"; } catch (e) { return "en"; }
  }

  function timeAgo(dateStr) {
    var then = new Date(dateStr).getTime();
    if (isNaN(then)) return "";
    var diffMin = Math.max(1, Math.floor((Date.now() - then) / 60000));
    var lang = getLang();
    if (diffMin < 60) return diffMin + (lang === "ur" ? "م پہلے" : "m ago");
    var diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return diffH + (lang === "ur" ? "گھنٹے پہلے" : "h ago");
    var diffD = Math.floor(diffH / 24);
    return diffD + (lang === "ur" ? "دن پہلے" : "d ago");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ═══════════════════════════════════════════════
     NEWS — three-tier fallback chain
     ═══════════════════════════════════════════════ */
  function newsFromNewsAPI() {
    var key = (typeof CONFIG !== "undefined") ? CONFIG.NEWSAPI_KEY : "";
    if (!key || key.indexOf("PASTE") !== -1) return Promise.reject(new Error("no_newsapi_key"));

    var url = "https://newsapi.org/v2/everything?q=cryptocurrency%20OR%20bitcoin%20OR%20crypto"
      + "&sortBy=publishedAt&language=en&pageSize=8&apiKey=" + key;

    return fetchWithTimeout(url).then(function (d) {
      if (!d.articles || !d.articles.length) throw new Error("empty_newsapi_response");
      return d.articles.slice(0, 8).map(function (a) {
        return {
          headline: a.title,
          source: (a.source && a.source.name) || "News",
          time: a.publishedAt,
          url: a.url
        };
      });
    });
  }

  function newsFromCryptoCompare() {
    var url = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
    return fetchWithTimeout(url).then(function (d) {
      if (!d.Data || !d.Data.length) throw new Error("empty_cryptocompare_response");
      return d.Data.slice(0, 8).map(function (a) {
        return {
          headline: a.title,
          source: a.source_info && a.source_info.name ? a.source_info.name : (a.source || "CryptoCompare"),
          time: new Date(a.published_on * 1000).toISOString(),
          url: a.url
        };
      });
    });
  }

  function newsFromReddit() {
    var url = "https://www.reddit.com/r/CryptoCurrency/top.json?limit=8&t=day";
    return fetchWithTimeout(url).then(function (d) {
      var children = d.data && d.data.children;
      if (!children || !children.length) throw new Error("empty_reddit_response");
      return children.slice(0, 8).map(function (c) {
        var p = c.data;
        return {
          headline: p.title,
          source: "r/CryptoCurrency",
          time: new Date(p.created_utc * 1000).toISOString(),
          url: "https://reddit.com" + p.permalink
        };
      });
    });
  }

  function renderNews(items) {
    var feed = document.getElementById("newsFeed");
    if (!feed) return;

    if (!items || !items.length) {
      var lang = getLang();
      feed.innerHTML = '<div style="padding:10px 0;color:var(--text-sec);font-size:0.78rem;">'
        + (lang === "ur" ? "خبریں فی الحال دستیاب نہیں۔" : "News unavailable right now.")
        + "</div>";
      return;
    }

    feed.innerHTML = items.map(function (n) {
      return '<a class="news-it" href="' + escapeHtml(n.url) + '" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;color:inherit;">'
        + '<div class="news-hl">' + escapeHtml(n.headline) + '</div>'
        + '<div class="news-mt">' + escapeHtml(n.source) + ' · ' + timeAgo(n.time) + '</div>'
        + '</a>';
    }).join("");
  }

  function refreshNews() {
    newsFromNewsAPI()
      .catch(function (err) {
        console.warn("[AlphaMind] NewsAPI unavailable (" + err.message + ") — trying CryptoCompare…");
        return newsFromCryptoCompare();
      })
      .catch(function (err) {
        console.warn("[AlphaMind] CryptoCompare unavailable (" + err.message + ") — trying Reddit…");
        return newsFromReddit();
      })
      .then(function (items) {
        renderNews(items);
      })
      .catch(function (err) {
        console.warn("[AlphaMind] All news sources failed:", err.message);
        renderNews([]);
      });
  }

  /* ═══════════════════════════════════════════════
     FEAR & GREED INDEX — Alternative.me
     ═══════════════════════════════════════════════ */
  var FNG_LABELS = {
    "Extreme Fear": { en: "Extreme Fear", ur: "شدید خوف" },
    "Fear":         { en: "Fear",         ur: "خوف" },
    "Neutral":      { en: "Neutral",      ur: "غیر جانبدار" },
    "Greed":        { en: "Greed",        ur: "لالچ" },
    "Extreme Greed":{ en: "Extreme Greed", ur: "شدید لالچ" }
  };

  function fetchFearGreed() {
    var url = "https://api.alternative.me/fng/?limit=1";
    return fetchWithTimeout(url).then(function (d) {
      var entry = d.data && d.data[0];
      if (!entry) throw new Error("empty_fng_response");
      return {
        value: parseInt(entry.value, 10),
        classification: entry.value_classification
      };
    });
  }

  function renderFearGreed(data) {
    var valEl   = document.getElementById("fgValue");
    var lblEl   = document.getElementById("fgLabel");
    var arcEl   = document.getElementById("gaugeArc");
    var needleEl= document.getElementById("gaugeNeedle");
    if (!valEl) return;

    var value = Math.max(0, Math.min(100, data.value));
    var lang = getLang();
    var labelObj = FNG_LABELS[data.classification] || { en: data.classification, ur: data.classification };

    valEl.textContent = value;
    if (lblEl) lblEl.textContent = lang === "ur" ? labelObj.ur : labelObj.en;

    // Arc fill: dasharray is 168 (full arc length in this SVG)
    if (arcEl) {
      var offset = 168 * (1 - value / 100);
      arcEl.setAttribute("stroke-dashoffset", offset.toFixed(1));
    }

    // Needle: semicircle from 180° (value=0, pointing left) to 0° (value=100, pointing right)
    if (needleEl) {
      var angleDeg = 180 - (1.8 * value);
      var angleRad = angleDeg * Math.PI / 180;
      var cx = 75, cy = 76, len = 39;
      var x2 = cx + len * Math.cos(angleRad);
      var y2 = cy - len * Math.sin(angleRad);
      needleEl.setAttribute("x2", x2.toFixed(1));
      needleEl.setAttribute("y2", y2.toFixed(1));
    }
  }

  function refreshFearGreed() {
    fetchFearGreed()
      .then(renderFearGreed)
      .catch(function (err) {
        console.warn("[AlphaMind] Fear & Greed fetch failed:", err.message);
      });
  }

  /* ═══════════════════════════════════════════════
     RE-RENDER ON LANGUAGE CHANGE
     Both news timestamps and F&G label are language-dependent;
     re-render from cache when the user toggles EN/UR.
     ═══════════════════════════════════════════════ */
  var lastNewsItems = null;
  var lastFngData = null;

  var _origRenderNews = renderNews;
  renderNews = function (items) { lastNewsItems = items; _origRenderNews(items); };

  var _origRenderFearGreed = renderFearGreed;
  renderFearGreed = function (data) { lastFngData = data; _origRenderFearGreed(data); };

  document.addEventListener("click", function (e) {
    if (e.target && (e.target.id === "langToggle" || e.target.closest && e.target.closest(".lang-btn"))) {
      setTimeout(function () {
        if (lastNewsItems) renderNews(lastNewsItems);
        if (lastFngData) renderFearGreed(lastFngData);
      }, 50);
    }
  });

  /* ═══════════════════════════════════════════════
     BOOTSTRAP
     ═══════════════════════════════════════════════ */
  function init() {
    refreshNews();
    refreshFearGreed();
    setInterval(refreshNews, NEWS_REFRESH_MS);
    setInterval(refreshFearGreed, FNG_REFRESH_MS);
  }

  window.AlphaMindMarketData = {
    refreshNews: refreshNews,
    refreshFearGreed: refreshFearGreed
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  console.log("[AlphaMind] market-data.js loaded — News + Fear & Greed ready");

})();
