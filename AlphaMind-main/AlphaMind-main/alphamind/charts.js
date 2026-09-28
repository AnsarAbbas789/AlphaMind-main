/**
 * AlphaMind — charts.js
 * ========================================================
 * Renders a live candlestick chart inside dashboard.html's
 * existing #tradingChart placeholder div, using TradingView's
 * open-source lightweight-charts library (loaded via CDN —
 * see integration notes at the top of this response).
 *
 * Depends on binance.js being loaded first (for getCandleData
 * and connectLiveKline). Falls back to empty/defensive behavior
 * if binance.js or the lightweight-charts library aren't present,
 * so a missing script tag fails loudly in the console rather than
 * silently breaking dashboard.html.
 *
 * Exposes globally: initChart(), loadChartData(symbol, timeframe),
 * updateChartTheme(isDark), resizeChart(), drawSignalLines(signalData),
 * clearSignalLines()
 * ======================================================== */

"use strict";

(function () {

  /* ================================================================
     COLOR TOKENS — mirrors dashboard.html's CSS variables so the
     chart always matches the active theme.
  ================================================================ */
  var COLORS = {
    light: {
      background: "#ffffff",
      text: "#1a1a1a",
      textSecondary: "#5b6472",
      grid: "#e7e9ee",
      border: "#e7e9ee",
      crosshair: "#2563eb"
    },
    dark: {
      background: "#161b22",
      text: "#e6e6e6",
      textSecondary: "#9aa4b5",
      grid: "#262d3a",
      border: "#262d3a",
      crosshair: "#d4af37"
    },
    up: "#d4af37",   // gold — per spec, replaces the usual green for gains
    down: "#ef4444"  // red — losses
  };

  /* ================================================================
     SIGNAL LINE COLOR TOKENS — used only by drawSignalLines().
     Per design rule: NEVER use green anywhere. Entry = brand blue
     (dashed), Stop Loss = red (solid), TP1..TP4 = four shades of
     blue running light -> deep so all four stay distinguishable
     even when several sit close together on the price axis.
  ================================================================ */
  var SIGNAL_LINE_COLORS = {
    entry: "#2563eb",
    stopLoss: "#ef4444",
    tp: ["#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"] // TP1 (lightest) -> TP4 (deepest)
  };

  /* ================================================================
     STATE
  ================================================================ */
  var chart = null;
  var candleSeries = null;
  var volumeSeries = null;
  var chartContainerEl = null;
  var loadingOverlayEl = null;
  var resizeObserver = null;
  var klineDisconnect = null;     // teardown function for the active live-kline socket
  var currentSymbol = "BTCUSDT";
  var currentTimeframe = "1D";
  var isCurrentlyDark = false;
  var loadRequestToken = 0;       // guards against stale async responses overwriting newer ones
  var activeSignalLines = [];     // holds the IPriceLine objects created by drawSignalLines()

  /* ================================================================
     UTIL
  ================================================================ */
  function isLibraryAvailable() {
    return typeof window.LightweightCharts !== "undefined";
  }

  function isBinanceLayerAvailable() {
    return typeof window.getCandleData === "function";
  }

  function detectIsDark() {
    return document.body.getAttribute("data-theme") === "dark";
  }

  /* ================================================================
     LOADING OVERLAY — shown while candle data is being fetched
  ================================================================ */
  function ensureLoadingOverlay() {
    if (!chartContainerEl) return null;

    if (loadingOverlayEl && chartContainerEl.contains(loadingOverlayEl)) {
      return loadingOverlayEl;
    }

    var overlay = document.createElement("div");
    overlay.id = "chartLoadingOverlay";
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0,0,0,0.02)";
    overlay.style.backdropFilter = "blur(1px)";
    overlay.style.zIndex = "5";
    overlay.style.transition = "opacity 0.2s ease";
    overlay.style.pointerEvents = "none";

    var spinner = document.createElement("div");
    spinner.style.width = "34px";
    spinner.style.height = "34px";
    spinner.style.borderRadius = "50%";
    spinner.style.border = "3px solid rgba(212,175,55,0.25)";
    spinner.style.borderTopColor = "#d4af37";
    spinner.style.animation = "alphamindChartSpin 0.7s linear infinite";

    overlay.appendChild(spinner);
    chartContainerEl.appendChild(overlay);

    // Inject the keyframes once
    if (!document.getElementById("alphamindChartSpinKeyframes")) {
      var styleTag = document.createElement("style");
      styleTag.id = "alphamindChartSpinKeyframes";
      styleTag.textContent = "@keyframes alphamindChartSpin { to { transform: rotate(360deg); } }";
      document.head.appendChild(styleTag);
    }

    loadingOverlayEl = overlay;
    return overlay;
  }

  function showLoading() {
    var overlay = ensureLoadingOverlay();
    if (overlay) overlay.style.display = "flex";
  }

  function hideLoading() {
    if (loadingOverlayEl) loadingOverlayEl.style.display = "none";
  }

  /* ================================================================
     CHART CONTAINER PREP — dashboard.html's #tradingChart starts as
     a dashed-border placeholder with a centered "Chart will render
     here" message. We clear that placeholder content only once the
     real chart is ready to take its place.
  ================================================================ */
  function prepareContainer() {
    chartContainerEl = document.getElementById("tradingChart");

    if (!chartContainerEl) {
      console.warn("[charts.js] #tradingChart container not found in the DOM.");
      return false;
    }

    chartContainerEl.innerHTML = "";
    chartContainerEl.style.position = "relative";
    chartContainerEl.style.border = "1px solid var(--border)";
    chartContainerEl.style.borderStyle = "solid"; // remove the dashed placeholder styling
    chartContainerEl.style.overflow = "hidden";
    chartContainerEl.style.padding = "0";

    return true;
  }

  /* ================================================================
     initChart()
     Creates the lightweight-charts instance with candlestick +
     volume series, crosshair, and price line configured.
  ================================================================ */
  function initChart() {
    if (!isLibraryAvailable()) {
      console.warn("[charts.js] LightweightCharts library not found. " +
        "Make sure the CDN script tag is included before charts.js.");
      return null;
    }

    if (!prepareContainer()) return null;

    isCurrentlyDark = detectIsDark();
    var palette = isCurrentlyDark ? COLORS.dark : COLORS.light;

    chart = window.LightweightCharts.createChart(chartContainerEl, {
      width: chartContainerEl.clientWidth,
      height: chartContainerEl.clientHeight || 360,
      layout: {
        background: { type: "solid", color: palette.background },
        textColor: palette.text,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 12
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid }
      },
      crosshair: {
        mode: window.LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: palette.crosshair,
          width: 1,
          style: window.LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: palette.crosshair
        },
        horzLine: {
          color: palette.crosshair,
          width: 1,
          style: window.LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: palette.crosshair
        }
      },
      rightPriceScale: {
        borderColor: palette.border,
        textColor: palette.textSecondary
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false
      },
      handleScroll: true,
      handleScale: true
    });

    if (typeof chart.addSeries !== "function" || !window.LightweightCharts.CandlestickSeries) {
      console.warn("[charts.js] This LightweightCharts build doesn't expose addSeries()/CandlestickSeries — " +
        "you may be loading a v3.x bundle instead of v4+. Check the CDN script tag.");
      return null;
    }

    candleSeries = chart.addSeries(window.LightweightCharts.CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      priceLineVisible: true,
      priceLineColor: COLORS.up,
      priceLineWidth: 1,
      lastValueVisible: true
    });

    volumeSeries = chart.addSeries(window.LightweightCharts.HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "", // overlay on its own scale at the bottom
      color: palette.textSecondary
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 }
    });

    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.06, bottom: 0.22 }
    });

    // Fresh chart instance — any signal-line references from a previous
    // chart/series are no longer valid, so drop them defensively.
    activeSignalLines = [];

    installResizeHandling();
    ensureLoadingOverlay();

    return chart;
  }

  /* ================================================================
     RESIZE HANDLING — keeps the chart correctly sized when the
     window resizes or the sidebar collapses (binance.js calls
     resizeChart() after the sidebar's CSS transition completes).
  ================================================================ */
  function installResizeHandling() {
    if (!chartContainerEl || !chart) return;

    window.addEventListener("resize", resizeChart);

    if (typeof ResizeObserver !== "undefined") {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver(function () {
        resizeChart();
      });
      resizeObserver.observe(chartContainerEl);
    }
  }

  function resizeChart() {
    if (!chart || !chartContainerEl) return;
    var width = chartContainerEl.clientWidth;
    var height = chartContainerEl.clientHeight || 360;
    if (width > 0 && height > 0) {
      chart.resize(width, height);
    }
  }

  /* ================================================================
     loadChartData(symbol, timeframe)
     Fetches historical candles via binance.js and renders them.
     Also tears down any previous live-kline subscription and opens
     a new one so the latest (still-forming) candle updates live.
  ================================================================ */
  async function loadChartData(symbol, timeframe) {
    if (!chart || !candleSeries) {
      console.warn("[charts.js] loadChartData() called before initChart(). Initializing now.");
      initChart();
      if (!chart || !candleSeries) return; // library still unavailable
    }

    if (!isBinanceLayerAvailable()) {
      console.warn("[charts.js] binance.js not loaded — cannot fetch candle data. " +
        "Make sure binance.js is included before charts.js.");
      return;
    }

    // A different coin/timeframe is about to be loaded — an Entry/SL/TP
    // line set drawn for the previous signal no longer applies, so clear
    // it now (drawSignalLines() will redraw if a new signal is generated
    // for this coin).
    clearSignalLines();

    currentSymbol = (symbol || currentSymbol || "BTCUSDT").toUpperCase();
    currentTimeframe = timeframe || currentTimeframe || "1D";

    var myToken = ++loadRequestToken;
    showLoading();

    try {
      var candles = await window.getCandleData(currentSymbol, currentTimeframe, 500);

      // If a newer load request started while this one was in flight,
      // discard this (now-stale) result.
      if (myToken !== loadRequestToken) return;

      if (!candles || candles.length === 0) {
        console.warn("[charts.js] No candle data returned for", currentSymbol, currentTimeframe);
        candleSeries.setData([]);
        volumeSeries.setData([]);
        return;
      }

      var ohlc = candles.map(function (c) {
        return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
      });

      var palette = isCurrentlyDark ? COLORS.dark : COLORS.light;
      var volumeBars = candles.map(function (c) {
        return {
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? hexToRgba(COLORS.up, 0.35) : hexToRgba(COLORS.down, 0.35)
        };
      });

      candleSeries.setData(ohlc);
      volumeSeries.setData(volumeBars);
      chart.timeScale().fitContent();

      // Re-subscribe live kline updates for the new symbol/timeframe
      subscribeLiveKline(currentSymbol, currentTimeframe);

    } catch (err) {
      console.warn("[charts.js] loadChartData() failed:", err.message);
    } finally {
      if (myToken === loadRequestToken) hideLoading();
    }
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  /* ================================================================
     LIVE KLINE SUBSCRIPTION — updates the most recent (forming)
     candle in place as new ticks arrive, via binance.js's
     connectLiveKline().
  ================================================================ */
  function subscribeLiveKline(symbol, timeframe) {
    if (klineDisconnect) {
      klineDisconnect();
      klineDisconnect = null;
    }

    if (typeof window.connectLiveKline !== "function") return;

    klineDisconnect = window.connectLiveKline(symbol, timeframe, function (liveCandle) {
      // Only apply updates if this is still the chart's active symbol/timeframe
      if (symbol !== currentSymbol || timeframe !== currentTimeframe) return;
      if (!candleSeries || !volumeSeries) return;

      candleSeries.update({
        time: liveCandle.time,
        open: liveCandle.open,
        high: liveCandle.high,
        low: liveCandle.low,
        close: liveCandle.close
      });

      volumeSeries.update({
        time: liveCandle.time,
        value: liveCandle.volume,
        color: liveCandle.close >= liveCandle.open
          ? hexToRgba(COLORS.up, 0.35)
          : hexToRgba(COLORS.down, 0.35)
      });
    });
  }

  /* ================================================================
     updateChartTheme(isDark)
     Repaints the chart's background/grid/text/crosshair colors to
     match the dashboard's light/dark mode toggle. Candle colors
     (gold/red) stay constant in both themes per the brand spec.
  ================================================================ */
  function updateChartTheme(isDark) {
    isCurrentlyDark = !!isDark;

    if (!chart) return;

    var palette = isCurrentlyDark ? COLORS.dark : COLORS.light;

    chart.applyOptions({
      layout: {
        background: { type: "solid", color: palette.background },
        textColor: palette.text
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid }
      },
      crosshair: {
        vertLine: { color: palette.crosshair, labelBackgroundColor: palette.crosshair },
        horzLine: { color: palette.crosshair, labelBackgroundColor: palette.crosshair }
      },
      rightPriceScale: {
        borderColor: palette.border,
        textColor: palette.textSecondary
      },
      timeScale: {
        borderColor: palette.border
      }
    });

    if (volumeSeries) {
      volumeSeries.applyOptions({ color: palette.textSecondary });
    }
  }

  /* ================================================================
     drawSignalLines(signalData)
     Draws Entry / Stop Loss / TP1..TP4 as horizontal price lines on
     the candlestick series, using lightweight-charts v4's
     ISeriesApi.createPriceLine(). Always clears any lines from a
     previous signal first, so calling this repeatedly (e.g. after
     every "Generate Signal" click) never stacks stale lines.

     signalData is expected to look like the /api/signal response
     shape already used by ai-signal-fixed.js / renderSignal():
       { entry_price, stop_loss, take_profit_1..4, signal, ... }

     Design rule: green is never used anywhere in AlphaMind — Entry
     is brand blue (dashed), Stop Loss is red (solid), and the four
     take-profit levels are four shades of blue (light -> deep).
  ================================================================ */
  function drawSignalLines(signalData) {
    // Always clear first — never stack lines from a previous signal.
    clearSignalLines();

    if (!candleSeries || !signalData) return;
    if (!isLibraryAvailable() || !window.LightweightCharts.LineStyle) return;

    var LineStyle = window.LightweightCharts.LineStyle;

    function addLine(price, color, title, style, width) {
      var numericPrice = +price;
      if (!numericPrice || numericPrice <= 0) return; // skip 0/NEUTRAL placeholder values
      try {
        var line = candleSeries.createPriceLine({
          price: numericPrice,
          color: color,
          lineWidth: width || 2,
          lineStyle: style,
          axisLabelVisible: true,
          title: title
        });
        activeSignalLines.push(line);
      } catch (err) {
        console.warn("[charts.js] drawSignalLines() failed to draw line \"" + title + "\":", err.message);
      }
    }

    addLine(signalData.entry_price, SIGNAL_LINE_COLORS.entry, "Entry", LineStyle.Dashed, 2);
    addLine(signalData.stop_loss, SIGNAL_LINE_COLORS.stopLoss, "SL", LineStyle.Solid, 2);
    addLine(signalData.take_profit_1, SIGNAL_LINE_COLORS.tp[0], "TP1", LineStyle.Solid, 1);
    addLine(signalData.take_profit_2, SIGNAL_LINE_COLORS.tp[1], "TP2", LineStyle.Solid, 1);
    addLine(signalData.take_profit_3, SIGNAL_LINE_COLORS.tp[2], "TP3", LineStyle.Solid, 1);
    addLine(signalData.take_profit_4, SIGNAL_LINE_COLORS.tp[3], "TP4", LineStyle.Solid, 1);
  }

  /* ================================================================
     clearSignalLines()
     Removes every price line drawn by drawSignalLines(). Safe to
     call any time — including when there's nothing to clear, or
     when the chart/series hasn't been created yet.
  ================================================================ */
  function clearSignalLines() {
    if (candleSeries && activeSignalLines.length) {
      activeSignalLines.forEach(function (line) {
        try { candleSeries.removePriceLine(line); } catch (err) { /* already gone — ignore */ }
      });
    }
    activeSignalLines = [];
  }

  /* ================================================================
     BOOTSTRAP
     Initializes the chart once the DOM is ready, then loads the
     default symbol/timeframe. binance.js's own init() independently
     calls window.loadChartData() once it has fetched the coin list
     and auto-selected BTC — so the very first paint may come from
     either path, whichever resolves first. Calling initChart() here
     guarantees the chart instance exists before that happens.
  ================================================================ */
  function bootstrap() {
    if (!isLibraryAvailable()) {
      console.warn("[charts.js] LightweightCharts library not detected at startup. " +
        "Verify the CDN script tag is present and loads before charts.js.");
      return;
    }

    initChart();

    // Match whatever theme dashboard.html already applied on load
    updateChartTheme(detectIsDark());

    // Load a sensible default in case binance.js hasn't kicked off yet
    // (loadChartData() is safe to call twice — the token guard in
    // loadChartData() discards whichever response resolves first).
    var initialTf = (function () {
      var activeBtn = document.querySelector(".tf-btn.active");
      return activeBtn ? activeBtn.getAttribute("data-tf") : "1D";
    })();

    loadChartData(currentSymbol, initialTf);
  }

  /* ================================================================
     PUBLIC API
  ================================================================ */
  window.initChart = initChart;
  window.loadChartData = loadChartData;
  window.updateChartTheme = updateChartTheme;
  window.resizeChart = resizeChart;
  window.drawSignalLines = drawSignalLines;
  window.clearSignalLines = clearSignalLines;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

})();