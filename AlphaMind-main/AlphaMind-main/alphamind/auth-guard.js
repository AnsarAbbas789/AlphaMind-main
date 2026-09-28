/**
 * AlphaMind — auth-guard.js  (v2 — role-aware)
 * =====================================================
 * dashboard.html کی حفاظت — اگر کوئی صارف لاگ ان کیے بغیر
 * براہ راست dashboard.html کا لنک کھولے تو اسے index.html پر
 * واپس بھیج دیتا ہے۔
 *
 * ⚠️ نیا (v2): سیشن چیک کرنے کے بعد یہ فائل Supabase کے
 * "profiles" ٹیبل سے موجودہ یوزر کا role ("user" یا "admin")
 * بھی حاصل کرتی ہے، اور اسے alphamind:authReady ایونٹ کے
 * ساتھ dashboard.html کو بھیجتی ہے — تاکہ Admin Panel بٹن
 * صرف اصل ایڈمن کو نظر آئے۔
 *
 * انحصار:
 *   1. supabase-config.js (window.sb) پہلے لوڈ ہو چکی ہو
 *   2. auth.js (window.AlphaMindAuth) پہلے لوڈ ہو چکی ہو
 *   3. Supabase میں "profiles" ٹیبل + RLS پالیسیاں بن چکی ہوں
 *      (دیکھیں: supabase_admin_role_setup.sql)
 *
 * یہ فائل dashboard.html میں سب سے پہلے (باقی سب اسکرپٹس سے
 * پہلے، صرف supabase-config.js اور auth.js کے بعد) لوڈ ہونی
 * چاہیے، تاکہ dashboard کا مواد چند لمحوں کے لیے بھی نہ دکھے۔
 *
 * ⚠️ اہم حفاظتی نوٹ: یہاں role چیک کرنا صرف UI کو بہتر بنانے
 * (بٹن چھپانا/دکھانا) کے لیے ہے۔ اصل حفاظت ہمیشہ Supabase کی
 * Row Level Security (RLS) پالیسیوں میں ہونی چاہیے، کیونکہ
 * کوئی بھی چالاک یوزر براؤزر DevTools سے JavaScript کی اس
 * چیک کو bypass کر سکتا ہے۔ RLS ڈیٹابیس کی سطح پر روکتی ہے،
 * اس لیے وہی اصل قلعہ ہے۔
 * =====================================================
 */

(function () {
  "use strict";

  var LOGIN_PAGE = "index.html";

  /**
   * fetchProfile(userId)
   * profiles ٹیبل سے role اور full_name حاصل کرتا ہے۔
   * اگر کسی وجہ سے ناکام ہو (نیٹ ورک، RLS، ابھی ٹیبل نہ بنا ہو)
   * تو خاموشی سے role="user" فرض کر لیتا ہے — یعنی ناکامی کبھی
   * بھی خودکار طور پر ایڈمن رسائی نہیں دیتی (fail-safe رویہ)۔
   */
  async function fetchProfile(userId) {
    try {
      var result = await window.sb
        .from("profiles")
        .select("role, full_name")
        .eq("id", userId)
        .single();

      if (result.error) {
        console.warn("[AlphaMind] Profile/role fetch failed — defaulting to 'user':", result.error.message);
        return { role: "user", full_name: null };
      }
      return result.data || { role: "user", full_name: null };
    } catch (err) {
      console.warn("[AlphaMind] Profile/role fetch threw — defaulting to 'user':", err.message);
      return { role: "user", full_name: null };
    }
  }

  async function guard() {
    try {
      var session = await window.AlphaMindAuth.getSession();
      if (!session) {
        window.location.replace(LOGIN_PAGE);
        return;
      }

      window.AlphaMindUser = session.user;

      var profile = await fetchProfile(session.user.id);
      window.AlphaMindUser.role = profile.role || "user";
      window.AlphaMindUser.profile = profile;

      // dashboard.html اب e.detail.user اور e.detail.role دونوں پڑھتی ہے
      document.dispatchEvent(new CustomEvent("alphamind:authReady", {
        detail: {
          user: session.user,
          role: window.AlphaMindUser.role,
          profile: profile
        }
      }));
    } catch (err) {
      console.error("[AlphaMind] Session check failed:", err.message);
      window.location.replace(LOGIN_PAGE);
    }
  }

  guard();

})();