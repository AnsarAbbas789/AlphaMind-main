/**
 * AlphaMind — auth.js
 * =====================================================
 * Supabase Auth کے لیے مرکزی wrapper functions۔
 * index.html اور dashboard.html دونوں اسے استعمال کرتے ہیں۔
 *
 * انحصار: supabase-config.js (window.sb) پہلے لوڈ ہو چکی ہو۔
 *
 * فراہم کردہ عوامی API: window.AlphaMindAuth
 *   .signUp(name, email, password)        -> اکاؤنٹ بناتا ہے + OTP کوڈ ای میل کرتا ہے
 *   .verifySignupOtp(email, token)         -> 6 ہندسوں کا کوڈ تصدیق کرتا ہے
 *   .resendSignupOtp(email)                -> نیا کوڈ دوبارہ بھیجتا ہے
 *   .signIn(email, password)               -> لاگ ان
 *   .signInWithGoogle()                    -> Google OAuth (Supabase میں فعال ہونے پر)
 *   .signOut()                             -> لاگ آؤٹ
 *   .getSession()                          -> موجودہ session (Promise)
 *   .sendPasswordReset(email)              -> پاس ورڈ ری سیٹ ای میل
 * =====================================================
 */

(function () {
  "use strict";

  function ensureClient() {
    if (typeof window.sb === "undefined") {
      throw new Error("Supabase client موجود نہیں — supabase-config.js پہلے لوڈ کریں۔");
    }
    return window.sb;
  }

  /**
   * signUp — نیا اکاؤنٹ بناتا ہے۔
   * Supabase خودکار طور پر ایک تصدیقی ای میل بھیجتا ہے۔
   * ⚠️ یہ 6-digit OTP کوڈ تبھی بھیجے گا جب آپ Supabase ڈیش بورڈ میں
   * Authentication → Email Templates → "Confirm signup" ٹیمپلیٹ میں
   * {{ .ConfirmationURL }} کی بجائے {{ .Token }} استعمال کریں
   * (تفصیل نیچے integration-guide.md میں ہے)۔
   */
  async function signUp(name, email, password) {
    var client = ensureClient();
    var result = await client.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { full_name: name } // profiles ٹیبل میں ٹریگر کے ذریعے یہ خودکار کاپی ہوگا
      }
    });
    if (result.error) throw result.error;
    return result.data;
  }

  /**
   * verifySignupOtp — 6 ہندسوں کا کوڈ تصدیق کرتا ہے اور session بناتا ہے۔
   */
  async function verifySignupOtp(email, token) {
    var client = ensureClient();
    var result = await client.auth.verifyOtp({
      email: email,
      token: token,
      type: "signup"
    });
    if (result.error) throw result.error;
    return result.data; // { user, session }
  }

  /**
   * resendSignupOtp — نیا کوڈ دوبارہ بھیجتا ہے (Resend Code بٹن کے لیے)۔
   */
  async function resendSignupOtp(email) {
    var client = ensureClient();
    var result = await client.auth.resend({ type: "signup", email: email });
    if (result.error) throw result.error;
    return result.data;
  }

  /**
   * signIn — ای میل + پاس ورڈ سے لاگ ان۔
   */
  async function signIn(email, password) {
    var client = ensureClient();
    var result = await client.auth.signInWithPassword({ email: email, password: password });
    if (result.error) throw result.error;
    return result.data;
  }

  /**
   * signInWithGoogle — Google OAuth (ابھی Supabase ڈیش بورڈ میں فعال نہیں،
   * فعال کرنے پر خودکار کام کرے گا)۔
   */
  async function signInWithGoogle() {
    var client = ensureClient();
    var result = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/dashboard.html" }
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signOut() {
    var client = ensureClient();
    var result = await client.auth.signOut();
    if (result.error) throw result.error;
  }

  async function getSession() {
    var client = ensureClient();
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session; // null اگر لاگ ان نہیں
  }

  async function sendPasswordReset(email) {
    var client = ensureClient();
    var result = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/index.html"
    });
    if (result.error) throw result.error;
  }

  /**
   * getProfile — موجودہ لاگ ان یوزر کی profiles ٹیبل کی row + ای میل
   * (ای میل صرف auth.users میں ہوتا ہے، اسی لیے session سے لیا جاتا ہے)۔
   */
  async function getProfile() {
    var client = ensureClient();
    var sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    var session = sessionResult.data.session;
    if (!session) throw new Error("not_logged_in");

    var result = await client
      .from("profiles")
      .select("full_name, role, created_at")
      .eq("id", session.user.id)
      .single();
    if (result.error) throw result.error;

    return {
      full_name: result.data.full_name,
      role: result.data.role,
      created_at: result.data.created_at,
      email: session.user.email
    };
  }

  /**
   * updateFullName — profiles ٹیبل اور auth user_metadata دونوں میں
   * نام sync رکھتا ہے۔
   */
  async function updateFullName(name) {
    var client = ensureClient();
    var sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    var session = sessionResult.data.session;
    if (!session) throw new Error("not_logged_in");

    var dbResult = await client.from("profiles").update({ full_name: name }).eq("id", session.user.id);
    if (dbResult.error) throw dbResult.error;

    var authResult = await client.auth.updateUser({ data: { full_name: name } });
    if (authResult.error) throw authResult.error;
  }

  /**
   * updatePassword — Supabase Auth کے ذریعے موجودہ لاگ ان سیشن کا
   * پاس ورڈ تبدیل کرتا ہے۔
   */
  async function updatePassword(newPassword) {
    var client = ensureClient();
    var result = await client.auth.updateUser({ password: newPassword });
    if (result.error) throw result.error;
  }

  window.AlphaMindAuth = {
    signUp: signUp,
    verifySignupOtp: verifySignupOtp,
    resendSignupOtp: resendSignupOtp,
    signIn: signIn,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getSession: getSession,
    sendPasswordReset: sendPasswordReset,
    getProfile: getProfile,
    updateFullName: updateFullName,
    updatePassword: updatePassword
  };

  console.log("[AlphaMind] auth.js loaded — AlphaMindAuth ready");

})();