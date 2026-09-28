/**
 * AlphaMind — config.js
 * =====================================================
 * ⚠️ سیکیورٹی اپڈیٹ: Gemini/Groq API Keys اب یہاں نہیں ہیں —
 * وہ FastAPI بیک اینڈ کے پاس محفوظ ہیں۔ ai-signal-fixed.js اب
 * براہ راست Gemini/Groq کو نہیں بلکہ CONFIG.AI_SIGNAL_ENDPOINT
 * (آپ کا Python/FastAPI سرور) کو کال کرتا ہے۔
 *
 * Bybit/OKX/BingX/KuCoin کی API keys بھی ہٹا دی گئی ہیں کیونکہ
 * موجودہ کوڈ صرف عوامی (public) مارکیٹ ڈیٹا استعمال کرتا ہے —
 * کسی جگہ signing نہیں ہو رہی۔
 *
 * یہ فائل کبھی کسی کو نہ بھیجیں۔
 * =====================================================
 */

const CONFIG = {

  /* ═══════════════════════════════════════
     AI SIGNAL ENDPOINT — آپ کا FastAPI بیک اینڈ
     ═══════════════════════════════════════ */

  // Local development کے لیے FastAPI سرور کا پتہ
  // (پروڈکشن ڈیپلائے ہونے کے بعد اسے حقیقی سرور URL سے بدلیں)
  AI_SIGNAL_ENDPOINT: "http://localhost:8000/api/signal",

  // Live Scanner — پس منظر میں ہر چند منٹ بعد بیک اینڈ خود واچ لسٹ
  // کوائنز کو اسکین کر کے یہاں نتیجہ رکھتا ہے؛ فرنٹ اینڈ صرف پڑھتا ہے۔
  SCAN_RESULTS_ENDPOINT: "http://localhost:8000/api/scan-results",

  /* ═══════════════════════════════════════
     NEWS KEY — خبریں
     ═══════════════════════════════════════ */

  // NewsAPI.org — مفت: https://newsapi.org (خالی چھوڑیں تو خودکار
  // CryptoCompare اور Reddit سے خبریں آ جائیں گی، Key کی ضرورت نہیں)
  // نوٹ: NewsAPI کا فری پلان صرف localhost پر براؤزر سے کام کرتا ہے،
  // لائیو ہونے کے بعد خودکار CryptoCompare پر منتقل ہو جائے گا۔
  NEWSAPI_KEY: "",

  // CryptoPanic — مفت: https://cryptopanic.com/developers/api/ (ابھی استعمال نہیں ہو رہا — paid plan درکار)
  CRYPTOPANIC_API_KEY: "",

  /* ═══════════════════════════════════════
     ACTIVE EXCHANGE — ڈیفالٹ ایکسچینج
     ═══════════════════════════════════════
     یہاں لکھیں کون سا ایکسچینج ابھی استعمال کریں:
     "binance" | "bybit" | "okx" | "bingx" | "kucoin"
     (یہ سب صرف عوامی مارکیٹ ڈیٹا کے لیے ہیں، کسی API key کی ضرورت نہیں)
     ═══════════════════════════════════════ */

  ACTIVE_EXCHANGE: "bybit"

};