/**
 * AlphaMind — ai-signal-fixed.js
 * =====================================================
 * Multi-AI Signal Engine — Manual Trigger Only
 *
 * ⚠️ اپڈیٹ: اب یہ فائل candles خود نہیں لاتی اور indicators/bias
 * خود calculate نہیں کرتی — یہ سب اب Python/FastAPI بیک اینڈ
 * (app/routes/signal.py -> signal_composer.py) پر ہوتا ہے، جو
 * 15m/1H/4H/1D multi-timeframe تجزیہ + 5-LLM ensemble استعمال
 * کرتا ہے۔ یہ فائل صرف symbol + marketType بھیجتی ہے اور مکمل
 * تیار شدہ سگنل واپس لیتی ہے۔
 *
 * Endpoint: POST CONFIG.AI_SIGNAL_ENDPOINT   (مثلاً /api/signal)
 * Request:  { symbol, marketType, exchange? }
 * Response: سیدھا signal object (کوئی {data:{...}} wrapper نہیں)
 *
 * انحصار: supabase-config.js (window.sb) پہلے لوڈ ہو چکی ہو،
 * تاکہ لاگ ان یوزر کا session token بیک اینڈ کو بھیجا جا سکے۔
 * چارٹ پر Entry/SL/TP لائنوں کے لیے charts.js کے
 * window.drawSignalLines()/window.clearSignalLines() پر انحصار
 * (اختیاری — اگر موجود نہ ہوں تو خاموشی سے نظرانداز ہو جاتا ہے)۔
 *
 * ⚠️ صرف بٹن دبانے پر چلے — کوئی Auto نہیں
 * =====================================================
 */

(function () {
  "use strict";

  /* ═══════════════════════════════════════════════
     Constants
     ═══════════════════════════════════════════════ */
  // بیک اینڈ 4 timeframes کے candles لاتا ہے + 5 LLMs کو کال کرتا ہے،
  // اس لیے پرانے 25s کی بجائے زیادہ وقت دیا گیا ہے۔
  var TIMEOUT_MS = 60000;

  /* ═══════════════════════════════════════════════
     Auth / Token
     ═══════════════════════════════════════════════ */
  function withTimeout(promise) {
    var timer = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error("timeout")); }, TIMEOUT_MS);
    });
    return Promise.race([promise, timer]);
  }

  async function getAccessToken() {
    if (typeof window.sb === "undefined") {
      throw new Error("supabase_client_missing");
    }
    var result = await window.sb.auth.getSession();
    if (result.error) throw result.error;
    var session = result.data && result.data.session;
    if (!session || !session.access_token) throw new Error("not_logged_in");
    return session.access_token;
  }

  /* ═══════════════════════════════════════════════
     API Call — FastAPI بیک اینڈ کا /api/signal
     ═══════════════════════════════════════════════ */
  function getActiveExchangeId() {
    // dashboard.html کے exchange dropdown (selExch) اور
    // exchange-api.js دونوں CONFIG.ACTIVE_EXCHANGE اپڈیٹ کرتے ہیں۔
    if (window.AlphaMindExchange && window.AlphaMindExchange.getActiveExchange) {
      var ex = window.AlphaMindExchange.getActiveExchange();
      if (ex && ex.name) return ex.name.toLowerCase();
    }
    if (typeof CONFIG !== "undefined" && CONFIG.ACTIVE_EXCHANGE) {
      return CONFIG.ACTIVE_EXCHANGE.toLowerCase();
    }
    return null;
  }

  /**
   * parseErrorResponse — FastAPI کی مختلف error shapes کو ایک
   * واحد پیغام میں بدلتا ہے:
   *   - HTTPException(detail="...")            -> { detail: "..." }
   *   - عالمی exception handler                -> { error, detail }
   *   - Pydantic validation error (422)         -> { detail: [ {msg, loc}, ... ] }
   */
  function parseErrorResponse(status, body) {
    if (!body) return "http_" + status;
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail) && body.detail.length) {
      return body.detail.map(function (d) { return d.msg || JSON.stringify(d); }).join("; ");
    }
    if (body.error) return body.detail ? (body.error + ": " + body.detail) : body.error;
    return "http_" + status;
  }

  function callSignalAPI(symbol, marketType) {
    var endpoint = (typeof CONFIG !== "undefined") ? CONFIG.AI_SIGNAL_ENDPOINT : null;
    if (!endpoint) return Promise.reject(new Error("no_endpoint_configured"));

    console.log("[AlphaMind] Calling signal engine:", symbol, marketType);

    return getAccessToken().then(function (token) {
      var body = { symbol: symbol, marketType: marketType };
      var exchangeId = getActiveExchangeId();
      if (exchangeId) body.exchange = exchangeId;

      return withTimeout(fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (d) {
          if (!res.ok) {
            throw new Error(parseErrorResponse(res.status, d));
          }
          return d; // سیدھا signal object — کوئی wrapper نہیں
        });
      }));
    });
  }

  /* ═══════════════════════════════════════════════
     DOM Render
     ═══════════════════════════════════════════════ */
  function getLang() {
    try { return localStorage.getItem("alphamind_lang") || "en"; } catch (e) { return "en"; }
  }

  function setText(id, en, ur) {
    var el = document.getElementById(id);
    if (!el) { console.warn("[AlphaMind] Missing element:", id); return; }
    el.textContent = getLang() === "ur" ? (ur || en) : en;
  }

  function fmt(n) { return n ? "$" + (+n).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"; }

  function renderSignal(data, marketType) {
    var badge = document.getElementById("signalBadge");
    if (badge) {
      badge.textContent = data.signal || "NEUTRAL";
      badge.style.background =
        data.signal === "LONG"  ? "#2563eb" :
        data.signal === "SHORT" ? "#ef4444" : "#6b7280";
      badge.style.color = "#fff";
    }

    var confBar  = document.getElementById("confidenceBar");
    var confText = document.getElementById("confidenceText");
    if (confBar)  confBar.style.width  = (data.confidence || 0) + "%";
    if (confText) confText.textContent = (data.confidence || 0) + "%";

    var strength = document.getElementById("strengthLabel");
    if (strength) strength.textContent = data.strength || "—";

    var risk = document.getElementById("riskLevelBadge");
    if (risk) {
      risk.textContent = data.risk_level || "—";
      risk.style.background =
        data.risk_level === "Low"  ? "#2563eb" :
        data.risk_level === "High" ? "#ef4444" : "#d4af37";
    }

    setText("entryPriceBox",  fmt(data.entry_price),    fmt(data.entry_price));
    setText("stopLossBox",    fmt(data.stop_loss),       fmt(data.stop_loss));
    setText("tp1Box", "TP1: " + fmt(data.take_profit_1), "TP1: " + fmt(data.take_profit_1));
    setText("tp2Box", "TP2: " + fmt(data.take_profit_2), "TP2: " + fmt(data.take_profit_2));
    setText("tp3Box", "TP3: " + fmt(data.take_profit_3), "TP3: " + fmt(data.take_profit_3));
    setText("tp4Box", "TP4: " + fmt(data.take_profit_4), "TP4: " + fmt(data.take_profit_4));

    var leverageBox = document.getElementById("leverageBox");
    var leverageVal = document.getElementById("leverageValue");
    if (marketType === "futures" && data.leverage_suggestion) {
      if (leverageBox) leverageBox.style.display = "flex";
      if (leverageVal) leverageVal.textContent = data.leverage_suggestion + "x";
    } else {
      if (leverageBox) leverageBox.style.display = "none";
    }

    // بیک اینڈ ابھی صرف انگریزی indicator تجزیہ بھیجتا ہے (کوئی _ur
    // فیلڈ نہیں) — اردو موڈ میں بھی وہی انگریزی متن fallback کے
    // طور پر دکھایا جائے گا، setText() کا "ur || en" پیٹرن یہی کرتا ہے۔
    var bd = data.indicator_breakdown || {};
    var lang = getLang();
    setText("rsiAnalysisText",  bd.rsi_analysis_en  || "—", bd.rsi_analysis_ur  || bd.rsi_analysis_en  || "—");
    setText("macdAnalysisText", bd.macd_analysis_en || "—", bd.macd_analysis_ur || bd.macd_analysis_en || "—");
    setText("emaAnalysisText",  bd.ema_analysis_en  || "—", bd.ema_analysis_ur  || bd.ema_analysis_en  || "—");
    setText("reasoningText",
      lang === "ur" ? (data.reasoning_ur || data.reasoning_en || "—") : (data.reasoning_en || "—"),
      data.reasoning_ur || data.reasoning_en || "—");
    setText("invalidationNoteText",
      lang === "ur" ? (data.invalidation_note_ur || data.invalidation_note_en || "—") : (data.invalidation_note_en || "—"),
      data.invalidation_note_ur || data.invalidation_note_en || "—");

    // ─────────────────────────────────────────────────────────────
    // چارٹ پر Entry/SL/TP لائنیں — صرف NEUTRAL نہ ہونے پر کھینچیں۔
    // charts.js لوڈ نہ ہونے کی صورت میں (یا کوئی وجہ سے فنکشن غائب
    // ہو) خاموشی سے نظرانداز ہو جائے گا — یہاں کریش نہیں ہونا چاہیے۔
    // ─────────────────────────────────────────────────────────────
    if (data.signal && data.signal !== "NEUTRAL") {
      if (window.drawSignalLines) window.drawSignalLines(data);
    } else {
      if (window.clearSignalLines) window.clearSignalLines();
    }
  }

  function setButtonLoading(loading) {
    var btn  = document.getElementById("generateSignalBtn");
    var text = document.getElementById("generateSignalBtnText");
    if (!btn) return;
    btn.disabled = loading;
    if (text) text.textContent = loading
      ? (getLang() === "ur" ? "تجزیہ ہو رہا ہے…" : "Analyzing…")
      : (getLang() === "ur" ? "سگنل بنائیں"       : "Generate Signal");
    btn.style.opacity = loading ? "0.6" : "1";
  }

  /* ═══════════════════════════════════════════════
     Error → Friendly Message
     ═══════════════════════════════════════════════ */
  var ERROR_MESSAGES = {
    not_logged_in:        { en: "Please log in again to generate signals.", ur: "سگنل بنانے کے لیے براہ کرم دوبارہ لاگ ان کریں۔" },
    supabase_client_missing: { en: "Supabase not loaded — please refresh the page.", ur: "Supabase لوڈ نہیں ہوا — صفحہ ریفریش کریں۔" },
    no_endpoint_configured:  { en: "AI service not configured. Check CONFIG.AI_SIGNAL_ENDPOINT.", ur: "اے آئی سروس کنفیگر نہیں — CONFIG.AI_SIGNAL_ENDPOINT چیک کریں۔" },
    timeout:               { en: "The AI engine took too long to respond. Please try again.", ur: "اے آئی انجن کا جواب دیر سے آیا — دوبارہ کوشش کریں۔" },
    missing_authorization_header: { en: "Session expired. Please log in again.", ur: "سیشن ختم ہو گیا — دوبارہ لاگ ان کریں۔" },
    token_expired:          { en: "Session expired. Please log in again.", ur: "سیشن ختم ہو گیا — دوبارہ لاگ ان کریں۔" },
    invalid_token:          { en: "Session invalid. Please log in again.", ur: "سیشن غلط ہے — دوبارہ لاگ ان کریں۔" },
    server_auth_not_configured: { en: "Server auth is not configured yet.", ur: "سرور پر auth ابھی کنفیگر نہیں ہوا۔" },
    invalid_market_type:    { en: "Invalid market type selected.", ur: "غلط مارکیٹ ٹائپ منتخب ہوئی۔" },
    not_enough_llm_providers_configured: { en: "Not enough AI providers configured on the server (need at least 2 API keys).", ur: "سرور پر کافی اے آئی پرووائیڈرز کنفیگر نہیں (کم از کم 2 API keys درکار ہیں)۔" }
  };

  function fallbackSignal(reason) {
    var lang = getLang();
    var known = ERROR_MESSAGES[reason];
    var friendlyEn, friendlyUr;

    if (known) {
      friendlyEn = known.en;
      friendlyUr = known.ur;
    } else if (typeof reason === "string" && reason.indexOf("candle_fetch_failed") === 0) {
      friendlyEn = "Could not fetch market candles right now. Please try again shortly.";
      friendlyUr = "مارکیٹ کینڈلز ابھی نہیں مل سکیں — تھوڑی دیر بعد کوشش کریں۔";
    } else {
      friendlyEn = "AI analysis unavailable right now: " + reason + ". Please try again shortly.";
      friendlyUr = "اے آئی تجزیہ فی الحال ناکام: " + reason + "۔ براہ کرم تھوڑی دیر بعد دوبارہ کوشش کریں۔";
    }

    return {
      signal: "NEUTRAL", confidence: 0, strength: "Weak", risk_level: "High",
      entry_price: 0, stop_loss: 0,
      take_profit_1: 0, take_profit_2: 0, take_profit_3: 0, take_profit_4: 0,
      reasoning_en: friendlyEn,
      reasoning_ur: friendlyUr,
      indicator_breakdown: {}
    };
  }

  /* ═══════════════════════════════════════════════
     Main — Manual Trigger Only
     ═══════════════════════════════════════════════ */
  window.generateSignalManual = function () {
    var symbol = "BTCUSDT";
    if (typeof window.currentSymbol === "string" && window.currentSymbol) {
      symbol = window.currentSymbol;
    } else {
      var activeRow = document.querySelector(".crow.act");
      if (activeRow && activeRow.dataset.symbol) symbol = activeRow.dataset.symbol;
    }

    var marketType = "spot";
    if (typeof window.currentMkt === "string" && window.currentMkt) {
      marketType = window.currentMkt;
    } else {
      var futuresBtn = document.getElementById("futuresBtn");
      if (futuresBtn && futuresBtn.classList.contains("act")) marketType = "futures";
    }

    console.log("[AlphaMind] Generating signal for:", symbol, "|", marketType);
    setButtonLoading(true);

    callSignalAPI(symbol, marketType)
      .then(function (data) {
        if (!data) throw new Error("empty_response");
        console.log("[AlphaMind] Signal received:", data.signal, data.confidence + "%",
          data.blocked_reason ? ("(blocked: " + data.blocked_reason + ")") : "");
        renderSignal(data, marketType);
        if (window.AlphaMindHistory && data.signal !== "NEUTRAL") {
          window.AlphaMindHistory.saveSignal(data, symbol, marketType);
        }
      })
      .catch(function (err) {
        console.error("[AlphaMind] Signal generation failed:", err.message);
        renderSignal(fallbackSignal(err.message), marketType);
      })
      .finally(function () {
        setButtonLoading(false);
      });
  };

  console.log("[AlphaMind] ai-signal-fixed.js loaded — FastAPI /api/signal mode (server-side multi-timeframe + 5-LLM ensemble)");

})();