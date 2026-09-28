/**
 * AlphaMind — exchange-api.js
 * =====================================================
 * پانچ ایکسچینج کا مرکزی انتظام:
 * Binance | Bybit | OKX | BingX | KuCoin
 *
 * یہ فائل خودکار CONFIG.ACTIVE_EXCHANGE دیکھ کر
 * صحیح ایکسچینج سے ڈیٹا لاتی ہے۔
 * بغیر API Key کے بھی عام چارٹ ڈیٹا آتا ہے۔
 * =====================================================
 */

(function () {
  "use strict";

  /* ═══════════════════════════════════════════════
     ایکسچینج کی بنیادی معلومات
     ═══════════════════════════════════════════════ */

  var EXCHANGES = {
    binance: {
      name: "Binance",
      baseREST: "https://api.binance.com",
      baseWS:   "wss://stream.binance.com:9443/ws",
      candlePath: function (symbol, interval, limit) {
        return "/api/v3/klines?symbol=" + symbol + "&interval=" + interval + "&limit=" + limit;
      },
      tickerPath: function (symbol) {
        return "/api/v3/ticker/24hr?symbol=" + symbol;
      },
      allTickersPath: "/api/v3/ticker/24hr",
      intervalMap: { "1m":"1m","5m":"5m","15m":"15m","30m":"30m","1H":"1h","4H":"4h","1D":"1d","1W":"1w" },
      parseCandles: parseBinanceCandles,
      parseTicker:  parseBinanceTicker,
      wsKlinePath:  function (symbol, interval) {
        return symbol.toLowerCase() + "@kline_" + interval;
      }
    },

    bybit: {
      name: "Bybit",
      baseREST: "https://api.bybit.com",
      baseWS:   "wss://stream.bybit.com/v5/public/spot",
      candlePath: function (symbol, interval, limit) {
        return "/v5/market/kline?category=spot&symbol=" + symbol + "&interval=" + interval + "&limit=" + limit;
      },
      tickerPath: function (symbol) {
        return "/v5/market/tickers?category=spot&symbol=" + symbol;
      },
      allTickersPath: "/v5/market/tickers?category=spot",
      intervalMap: { "1m":"1","5m":"5","15m":"15","30m":"30","1H":"60","4H":"240","1D":"D","1W":"W" },
      parseCandles: parseBybitCandles,
      parseTicker:  parseBybitTicker,
      wsKlinePath:  null
    },

    okx: {
      name: "OKX",
      baseREST: "https://www.okx.com",
      baseWS:   "wss://ws.okx.com:8443/ws/v5/public",
      candlePath: function (symbol, interval, limit) {
        var s = symbol.replace("USDT", "-USDT");
        return "/api/v5/market/candles?instId=" + s + "&bar=" + interval + "&limit=" + limit;
      },
      tickerPath: function (symbol) {
        return "/api/v5/market/ticker?instId=" + symbol.replace("USDT", "-USDT");
      },
      allTickersPath: "/api/v5/market/tickers?instType=SPOT",
      intervalMap: { "1m":"1m","5m":"5m","15m":"15m","30m":"30m","1H":"1H","4H":"4H","1D":"1Dutc","1W":"1Wutc" },
      parseCandles: parseOKXCandles,
      parseTicker:  parseOKXTicker,
      wsKlinePath:  null
    },

    bingx: {
      name: "BingX",
      baseREST: "https://open-api.bingx.com",
      baseWS:   null,
      candlePath: function (symbol, interval, limit) {
        return "/openApi/spot/v2/market/kline?symbol=" + symbol + "&interval=" + interval + "&limit=" + limit;
      },
      tickerPath: function (symbol) {
        return "/openApi/spot/v1/ticker/24hr?symbol=" + symbol;
      },
      allTickersPath: "/openApi/spot/v1/ticker/24hr",
      intervalMap: { "1m":"1m","5m":"5m","15m":"15m","30m":"30m","1H":"1h","4H":"4h","1D":"1d","1W":"1w" },
      parseCandles: parseBingXCandles,
      parseTicker:  parseBingXTicker,
      wsKlinePath:  null
    },

    kucoin: {
      name: "KuCoin",
      baseREST: "https://api.kucoin.com",
      baseWS:   null,
      candlePath: function (symbol, interval, limit) {
        var s = symbol.replace("USDT", "-USDT");
        var now   = Math.floor(Date.now() / 1000);
        var start = now - limit * intervalToSeconds(interval);
        return "/api/v1/market/candles?symbol=" + s + "&type=" + interval + "&startAt=" + start + "&endAt=" + now;
      },
      tickerPath: function (symbol) {
        return "/api/v1/market/orderbook/level1?symbol=" + symbol.replace("USDT", "-USDT");
      },
      allTickersPath: "/api/v1/market/allTickers",
      intervalMap: { "1m":"1min","5m":"5min","15m":"15min","30m":"30min","1H":"1hour","4H":"4hour","1D":"1day","1W":"1week" },
      parseCandles: parseKuCoinCandles,
      parseTicker:  parseKuCoinTicker,
      wsKlinePath:  null
    }
  };

  /* ═══════════════════════════════════════════════
     وقت کا حساب — KuCoin کے لیے
     ═══════════════════════════════════════════════ */
  function intervalToSeconds (iv) {
    var map = { "1min":60,"5min":300,"15min":900,"30min":1800,
                "1hour":3600,"4hour":14400,"1day":86400,"1week":604800 };
    return map[iv] || 3600;
  }

  /* ═══════════════════════════════════════════════
     Candle Parsers — ہر ایکسچینج کا الگ فارمیٹ
     ═══════════════════════════════════════════════ */
  function parseBinanceCandles (raw) {
    return raw.map(function (c) {
      return { time: Math.floor(c[0]/1000), open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] };
    });
  }

  function parseBybitCandles (raw) {
    var list = (raw.result && raw.result.list) ? raw.result.list : [];
    return list.reverse().map(function (c) {
      return { time: Math.floor(+c[0]/1000), open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] };
    });
  }

  function parseOKXCandles (raw) {
    var list = raw.data || [];
    return list.reverse().map(function (c) {
      return { time: Math.floor(+c[0]/1000), open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] };
    });
  }

  function parseBingXCandles (raw) {
    var list = raw.data || [];
    return list.map(function (c) {
      return { time: Math.floor(+c.openTime/1000), open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +c.volume };
    });
  }

  function parseKuCoinCandles (raw) {
    var list = raw.data || [];
    return list.reverse().map(function (c) {
      return { time: +c[0], open: +c[1], close: +c[2], high: +c[3], low: +c[4], volume: +c[5] };
    });
  }

  /* ═══════════════════════════════════════════════
     Ticker Parsers
     ═══════════════════════════════════════════════ */
  function parseBinanceTicker (raw) {
    return { symbol: raw.symbol, price: +raw.lastPrice, change: +raw.priceChangePercent, volume: +raw.volume };
  }
  function parseBybitTicker (raw) {
    var t = raw.result && raw.result.list && raw.result.list[0];
    if (!t) return null;
    return { symbol: t.symbol, price: +t.lastPrice, change: +t.price24hPcnt * 100, volume: +t.volume24h };
  }
  function parseOKXTicker (raw) {
    var t = raw.data && raw.data[0];
    if (!t) return null;
    return { symbol: t.instId.replace("-",""), price: +t.last, change: +t.chg24h * 100, volume: +t.vol24h };
  }
  function parseBingXTicker (raw) {
    var t = raw.data;
    if (!t) return null;
    return { symbol: t.symbol, price: +t.lastPrice, change: +t.priceChangePercent, volume: +t.volume };
  }
  function parseKuCoinTicker (raw) {
    var t = raw.data;
    if (!t) return null;
    return { symbol: t.symbol, price: +t.price, change: 0, volume: 0 };
  }

  /* ═══════════════════════════════════════════════
     مرکزی ڈیٹا فنکشن
     ═══════════════════════════════════════════════ */

  function getActiveExchange () {
    var name = (typeof CONFIG !== "undefined" && CONFIG.ACTIVE_EXCHANGE)
      ? CONFIG.ACTIVE_EXCHANGE.toLowerCase() : "binance";
    return EXCHANGES[name] || EXCHANGES.binance;
  }

  function fetchWithTimeout (url, ms) {
    ms = ms || 10000;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("timeout")); }, ms);
      fetch(url)
        .then(function (r) { clearTimeout(timer); return r.json(); })
        .then(resolve)
        .catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  /**
   * getCandleData(symbol, timeframe, limit)
   * فعال ایکسچینج سے Candle ڈیٹا لائے
   */
  function getCandleData (symbol, timeframe, limit) {
    limit = limit || 200;
    var ex  = getActiveExchange();
    var iv  = ex.intervalMap[timeframe] || ex.intervalMap["1H"];
    var url = ex.baseREST + ex.candlePath(symbol, iv, limit);

    return fetchWithTimeout(url, 12000)
      .then(function (raw) {
        return ex.parseCandles(raw);
      })
      .catch(function (err) {
        console.warn("[exchange-api] getCandleData error (" + ex.name + "):", err.message);
        // بنانس کو بیک اپ کے طور پر آزمائیں
        if (ex.name !== "Binance") {
          console.warn("[exchange-api] Falling back to Binance for candle data…");
          var fallbackIv  = EXCHANGES.binance.intervalMap[timeframe] || "1h";
          var fallbackUrl = EXCHANGES.binance.baseREST + EXCHANGES.binance.candlePath(symbol, fallbackIv, limit);
          return fetchWithTimeout(fallbackUrl, 12000).then(parseBinanceCandles);
        }
        return [];
      });
  }

  /**
   * getAllCoins()
   * تمام USDT جوڑوں کی فہرست لائے
   */
  function getAllCoins () {
    var ex  = getActiveExchange();
    var url = ex.baseREST + ex.allTickersPath;

    return fetchWithTimeout(url, 12000)
      .then(function (raw) {
        var list = [];
        if (ex.name === "Binance") {
          list = Array.isArray(raw) ? raw : [];
          list = list.filter(function (t) { return t.symbol && t.symbol.endsWith("USDT"); });
          return list.map(parseBinanceTicker);
        }
        if (ex.name === "Bybit") {
          list = (raw.result && raw.result.list) ? raw.result.list : [];
          list = list.filter(function (t) { return t.symbol && t.symbol.endsWith("USDT"); });
          return list.map(function (t) {
            return { symbol: t.symbol, price: +t.lastPrice, change: +t.price24hPcnt * 100, volume: +t.volume24h };
          });
        }
        if (ex.name === "OKX") {
          list = raw.data || [];
          list = list.filter(function (t) { return t.instId && t.instId.endsWith("-USDT"); });
          return list.map(function (t) {
            return { symbol: t.instId.replace("-",""), price: +t.last, change: +t.chg24h * 100, volume: +t.vol24h };
          });
        }
        if (ex.name === "BingX") {
          list = raw.data || [];
          list = list.filter(function (t) { return t.symbol && t.symbol.endsWith("-USDT"); });
          return list.map(function (t) {
            return { symbol: t.symbol.replace("-",""), price: +t.lastPrice, change: +t.priceChangePercent, volume: +t.volume };
          });
        }
        if (ex.name === "KuCoin") {
          var tickers = (raw.data && raw.data.ticker) ? raw.data.ticker : [];
          tickers = tickers.filter(function (t) { return t.symbol && t.symbol.endsWith("-USDT"); });
          return tickers.map(function (t) {
            return { symbol: t.symbol.replace("-",""), price: +t.last, change: +t.changeRate * 100, volume: +t.vol };
          });
        }
        return [];
      })
      .catch(function (err) {
        console.warn("[exchange-api] getAllCoins error:", err.message);
        return [];
      });
  }

  /**
   * getLivePriceWS(symbol, onPrice)
   * لائیو قیمت WebSocket سے (صرف بنانس اور بائی بٹ)
   */
  var _activeSockets = {};
  function getLivePriceWS (symbol, onPrice) {
    var ex = getActiveExchange();

    // پرانا Socket بند کریں
    if (_activeSockets[symbol]) {
      try { _activeSockets[symbol].close(); } catch (e) {}
    }

    if (ex.name === "Binance") {
      var ws = new WebSocket(ex.baseWS + "/" + symbol.toLowerCase() + "@aggTrade");
      ws.onmessage = function (e) {
        var d = JSON.parse(e.data);
        if (d && d.p) onPrice(+d.p);
      };
      ws.onerror = function () { console.warn("[exchange-api] Binance WS error"); };
      _activeSockets[symbol] = ws;
      return;
    }

    if (ex.name === "Bybit") {
      var ws2 = new WebSocket("wss://stream.bybit.com/v5/public/spot");
      ws2.onopen = function () {
        ws2.send(JSON.stringify({ op:"subscribe", args: ["tickers." + symbol] }));
      };
      ws2.onmessage = function (e) {
        var d = JSON.parse(e.data);
        if (d && d.data && d.data.lastPrice) onPrice(+d.data.lastPrice);
      };
      ws2.onerror = function () { console.warn("[exchange-api] Bybit WS error"); };
      _activeSockets[symbol] = ws2;
      return;
    }

    // باقی ایکسچینج کے لیے polling
    var pollTimer = setInterval(function () {
      var url = ex.baseREST + ex.tickerPath(symbol);
      fetch(url).then(function (r) { return r.json(); }).then(function (raw) {
        var t = ex.parseTicker(raw);
        if (t && t.price) onPrice(t.price);
      }).catch(function () {});
    }, 3000);
    _activeSockets[symbol] = { close: function () { clearInterval(pollTimer); } };
  }

  /**
   * closeAllSockets()
   * تمام WebSocket بند کریں
   */
  function closeAllSockets () {
    Object.keys(_activeSockets).forEach(function (k) {
      try { _activeSockets[k].close(); } catch (e) {}
    });
    _activeSockets = {};
  }

  /**
   * getExchangeList()
   * تمام دستیاب ایکسچینج کے نام
   */
  function getExchangeList () {
    return Object.keys(EXCHANGES).map(function (k) {
      return { id: k, name: EXCHANGES[k].name };
    });
  }

  /**
   * setActiveExchange(id)
   * ایکسچینج تبدیل کریں
   */
  function setActiveExchange (id) {
    if (!EXCHANGES[id]) { console.warn("[exchange-api] Unknown exchange:", id); return; }
    if (typeof CONFIG !== "undefined") CONFIG.ACTIVE_EXCHANGE = id;
    closeAllSockets();
    console.log("[exchange-api] Active exchange set to:", EXCHANGES[id].name);
  }

  /* ═══════════════════════════════════════════════
     عوامی Interface
     ═══════════════════════════════════════════════ */
  window.AlphaMindExchange = {
    getCandleData:     getCandleData,
    getAllCoins:        getAllCoins,
    getLivePriceWS:    getLivePriceWS,
    closeAllSockets:   closeAllSockets,
    getExchangeList:   getExchangeList,
    setActiveExchange: setActiveExchange,
    getActiveExchange: getActiveExchange
  };

  // پرانے binance.js کے ساتھ مطابقت
  window.getCandleData = getCandleData;

  console.log("[AlphaMind] exchange-api.js loaded — Active:", getActiveExchange().name);

})();