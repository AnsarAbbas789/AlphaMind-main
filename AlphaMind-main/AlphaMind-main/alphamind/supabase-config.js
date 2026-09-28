/**
 * AlphaMind — supabase-config.js
 * =====================================================
 * Supabase پروجیکٹ کنیکشن — یہ فائل صرف Client (browser) کے
 * لیے ہے۔ اس میں موجود anon key عوامی (public) استعمال کے لیے
 * محفوظ ہے — اسے چھپانے کی ضرورت نہیں۔
 *
 * ⚠️ کبھی بھی یہاں "service_role" key یا Database Password
 * نہ ڈالیں — وہ ہمیشہ خفیہ رہنی چاہیے۔
 *
 * لوڈ آرڈر (index.html اور dashboard.html دونوں میں):
 *   1. Supabase CDN script (نیچے دیکھیں)
 *   2. supabase-config.js  (یہ فائل)
 *   3. auth.js
 *   4. باقی سب فائلیں (config.js, exchange-api.js وغیرہ)
 *
 * HTML میں یہ لائن سب سے پہلے شامل کریں:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
 * =====================================================
 */

(function () {
  "use strict";

  var SUPABASE_URL = "https://bkfmctcwxssfjctflypc.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_guUDf6IGilZWX8ggCPhG4Q_bB06-tiJ";

  if (typeof window.supabase === "undefined") {
    console.error(
      "[AlphaMind] Supabase library لوڈ نہیں ہوئی۔ یقینی بنائیں کہ یہ اسکرپٹ ٹیگ " +
      "supabase-config.js سے پہلے موجود ہے: " +
      "<script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js\"></script>"
    );
    return;
  }

  // window.supabase.createClient سے ایک ہی مرکزی client بناتے ہیں
  // اور اسے window.sb کے نام سے پوری ایپ میں دستیاب کرتے ہیں
  // (window.supabase خود لائبریری کا نام ہے، اس لیے client کو الگ نام دیا)
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  console.log("[AlphaMind] Supabase client ready.");

})();