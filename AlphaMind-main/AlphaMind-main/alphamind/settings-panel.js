/**
 * AlphaMind — settings-panel.js
 * =====================================================
 * Account Settings Modal
 * - نام تبدیل کریں (profiles ٹیبل + auth دونوں میں محفوظ)
 * - اکاؤنٹ کی معلومات دیکھیں (ای میل، رکنیت کی قسم، تاریخِ رکنیت)
 * - پاس ورڈ تبدیل کریں
 *
 * انحصار: supabase-config.js (window.sb) اور auth.js
 * (window.AlphaMindAuth) پہلے لوڈ ہو چکی ہوں۔
 *
 * یہ فائل کسی موجودہ فائل کو تبدیل نہیں کرتی — صرف نیا
 * window.AlphaMindSettings عالمی آبجیکٹ فراہم کرتی ہے،
 * بالکل signal-history.js کے طرزِ عمل کی طرح۔
 * =====================================================
 */

"use strict";

(function () {

  /* ================================================================
     LANG HELPER — dashboard.html کی طرح localStorage سے زبان اٹھائیں
  ================================================================ */
  function getLang() {
    try { return localStorage.getItem("alphamind_lang") || "en"; } catch (e) { return "en"; }
  }

  var T = {
    title:        { en: "Account Settings",              ur: "اکاؤنٹ سیٹنگز" },
    profileSec:   { en: "Profile",                        ur: "پروفائل" },
    fullName:     { en: "Full Name",                       ur: "پورا نام" },
    saveName:     { en: "Save Name",                       ur: "نام محفوظ کریں" },
    accountSec:   { en: "Account Info",                    ur: "اکاؤنٹ کی معلومات" },
    email:        { en: "Email",                            ur: "ای میل" },
    plan:         { en: "Membership",                       ur: "رکنیت" },
    memberSince:  { en: "Member Since",                     ur: "رکنیت کی تاریخ" },
    roleAdmin:    { en: "Administrator",                    ur: "ایڈمنسٹریٹر" },
    roleUser:     { en: "Standard Member",                  ur: "عام رکن" },
    pwSec:        { en: "Change Password",                  ur: "پاس ورڈ تبدیل کریں" },
    newPw:        { en: "New Password",                     ur: "نیا پاس ورڈ" },
    confirmPw:    { en: "Confirm New Password",             ur: "نئے پاس ورڈ کی تصدیق" },
    savePw:       { en: "Update Password",                  ur: "پاس ورڈ اپڈیٹ کریں" },
    nameSaved:    { en: "✓ Name updated successfully.",     ur: "✓ نام کامیابی سے تبدیل ہو گیا۔" },
    pwSaved:      { en: "✓ Password updated successfully.", ur: "✓ پاس ورڈ کامیابی سے تبدیل ہو گیا۔" },
    pwMismatch:   { en: "Passwords do not match.",          ur: "پاس ورڈز مماثل نہیں ہیں۔" },
    pwTooShort:   { en: "Password must be at least 8 characters.", ur: "پاس ورڈ کم از کم 8 حروف کا ہونا چاہیے۔" },
    nameEmpty:    { en: "Please enter your name.",          ur: "براہ کرم اپنا نام درج کریں۔" },
    loadFailed:   { en: "Could not load your account info.", ur: "اکاؤنٹ کی معلومات لوڈ نہیں ہو سکیں۔" },
    loading:      { en: "Loading…",                          ur: "لوڈ ہو رہا ہے…" }
  };
  function tr(key) { return T[key] ? T[key][getLang()] : key; }

  /* ================================================================
     STYLES — dashboard.html کے CSS variables استعمال کرتے ہیں
  ================================================================ */
  function injectStyles() {
    if (document.getElementById("alphamindSettingsStyles")) return;
    var css = ''
      + '.set-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;'
      + 'display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;'
      + 'transition:opacity .25s ease;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;}'
      + '.set-overlay.show{opacity:1;}'
      + '.set-card{background:var(--card,#fff);color:var(--text,#1a1a1a);width:100%;max-width:480px;'
      + 'max-height:88vh;border-radius:16px;border:1px solid var(--border,#e7e9ee);'
      + 'box-shadow:0 24px 64px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;}'
      + '.set-hdr{display:flex;align-items:center;justify-content:space-between;'
      + 'padding:18px 22px;border-bottom:1px solid var(--border,#e7e9ee);flex-shrink:0;}'
      + '.set-title{font-size:1.05rem;font-weight:800;}'
      + '.set-close{background:none;border:none;color:var(--text-sec,#5b6472);cursor:pointer;'
      + 'font-size:1.3rem;line-height:1;padding:4px 8px;border-radius:6px;transition:background .2s;}'
      + '.set-close:hover{background:var(--row-hover,#f2f4f8);}'
      + '.set-body{overflow-y:auto;padding:18px 22px 22px;}'
      + '.set-section{margin-bottom:22px;}'
      + '.set-section:last-child{margin-bottom:0;}'
      + '.set-sec-title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;'
      + 'color:var(--gold-deep,#b8932a);margin-bottom:10px;}'
      + '.set-field{margin-bottom:12px;}'
      + '.set-label{display:block;font-size:.76rem;font-weight:700;color:var(--text-sec,#5b6472);margin-bottom:6px;}'
      + '.set-input{width:100%;background:var(--input-bg,#fbfbfd);border:1.5px solid var(--border,#e7e9ee);'
      + 'border-radius:9px;padding:9px 12px;font-size:.85rem;color:var(--text,#1a1a1a);outline:none;'
      + 'font-family:inherit;transition:border-color .2s;}'
      + '.set-input:focus{border-color:var(--blue-sec,#2563eb);}'
      + '.set-input[readonly]{opacity:.65;cursor:not-allowed;}'
      + '.set-btn{background:var(--gold,#d4af37);color:#1a1a1a;border:none;border-radius:9px;'
      + 'padding:9px 16px;font-size:.8rem;font-weight:800;cursor:pointer;transition:opacity .2s;}'
      + '.set-btn:hover{opacity:.88;}'
      + '.set-btn:disabled{opacity:.55;cursor:not-allowed;}'
      + '.set-info-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;'
      + 'border-bottom:1px solid var(--border,#e7e9ee);font-size:.8rem;}'
      + '.set-info-row:last-child{border-bottom:none;}'
      + '.set-info-lbl{color:var(--text-sec,#5b6472);font-weight:600;}'
      + '.set-info-val{font-weight:700;font-family:var(--mono,monospace);}'
      + '.set-badge{font-size:.66rem;font-weight:800;padding:2px 10px;border-radius:99px;'
      + 'background:rgba(212,175,55,.15);color:var(--gold-deep,#b8932a);text-transform:uppercase;}'
      + '.set-badge.admin{background:rgba(37,99,235,.15);color:var(--blue-sec,#2563eb);}'
      + '.set-alert{font-size:.76rem;font-weight:600;padding:8px 11px;border-radius:8px;margin-top:10px;display:none;}'
      + '.set-alert.show{display:block;}'
      + '.set-alert.ok{background:rgba(37,99,235,.08);color:var(--blue-sec,#2563eb);}'
      + '.set-alert.err{background:rgba(239,68,68,.08);color:var(--red,#ef4444);}'
      + '.set-loading{text-align:center;padding:30px 10px;color:var(--text-sec,#5b6472);font-size:.85rem;}';
    var tag = document.createElement("style");
    tag.id = "alphamindSettingsStyles";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /* ================================================================
     RENDER
  ================================================================ */
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString();
  }

  function buildCardHtml(profile) {
    var isAdmin = profile.role === "admin";
    var roleLabel = isAdmin ? tr("roleAdmin") : tr("roleUser");

    return ''
      + '<div class="set-overlay" id="setOverlay">'
      + '  <div class="set-card">'
      + '    <div class="set-hdr">'
      + '      <span class="set-title">⚙️ ' + tr("title") + '</span>'
      + '      <button class="set-close" id="setCloseBtn" type="button">✕</button>'
      + '    </div>'
      + '    <div class="set-body">'

      + '      <div class="set-section">'
      + '        <div class="set-sec-title">' + tr("profileSec") + '</div>'
      + '        <div class="set-field">'
      + '          <label class="set-label">' + tr("fullName") + '</label>'
      + '          <input type="text" class="set-input" id="setFullName" value="' + escapeAttr(profile.full_name || "") + '" />'
      + '        </div>'
      + '        <button class="set-btn" id="setSaveNameBtn" type="button">' + tr("saveName") + '</button>'
      + '        <div class="set-alert" id="setNameAlert"></div>'
      + '      </div>'

      + '      <div class="set-section">'
      + '        <div class="set-sec-title">' + tr("accountSec") + '</div>'
      + '        <div class="set-info-row"><span class="set-info-lbl">' + tr("email") + '</span>'
      + '          <span class="set-info-val">' + escapeAttr(profile.email || "—") + '</span></div>'
      + '        <div class="set-info-row"><span class="set-info-lbl">' + tr("plan") + '</span>'
      + '          <span class="set-badge' + (isAdmin ? ' admin' : '') + '">' + roleLabel + '</span></div>'
      + '        <div class="set-info-row"><span class="set-info-lbl">' + tr("memberSince") + '</span>'
      + '          <span class="set-info-val">' + fmtDate(profile.created_at) + '</span></div>'
      + '      </div>'

      + '      <div class="set-section">'
      + '        <div class="set-sec-title">' + tr("pwSec") + '</div>'
      + '        <div class="set-field">'
      + '          <label class="set-label">' + tr("newPw") + '</label>'
      + '          <input type="password" class="set-input" id="setNewPw" placeholder="••••••••" autocomplete="new-password" />'
      + '        </div>'
      + '        <div class="set-field">'
      + '          <label class="set-label">' + tr("confirmPw") + '</label>'
      + '          <input type="password" class="set-input" id="setConfirmPw" placeholder="••••••••" autocomplete="new-password" />'
      + '        </div>'
      + '        <button class="set-btn" id="setSavePwBtn" type="button">' + tr("savePw") + '</button>'
      + '        <div class="set-alert" id="setPwAlert"></div>'
      + '      </div>'

      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function escapeAttr(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showAlert(elId, msg, ok) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.className = "set-alert show " + (ok ? "ok" : "err");
  }

  /* ================================================================
     WIRE UP EVENTS
  ================================================================ */
  function wireEvents(profile) {
    var closeBtn = document.getElementById("setCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    var overlayEl = document.getElementById("setOverlay");
    if (overlayEl) {
      overlayEl.addEventListener("click", function (e) {
        if (e.target.id === "setOverlay") closeModal();
      });
    }
    document.addEventListener("keydown", escCloseOnce);

    // نام محفوظ کریں
    var saveNameBtn = document.getElementById("setSaveNameBtn");
    if (saveNameBtn) {
      saveNameBtn.addEventListener("click", function () {
        var name = document.getElementById("setFullName").value.trim();
        if (!name) { showAlert("setNameAlert", tr("nameEmpty"), false); return; }

        saveNameBtn.disabled = true;
        window.AlphaMindAuth.updateFullName(name)
          .then(function () {
            showAlert("setNameAlert", tr("nameSaved"), true);
            // sidebar میں نام فوراً اپڈیٹ کریں
            var nameEl = document.querySelector(".u-name");
            if (nameEl) nameEl.textContent = name;
            var avEl = document.querySelector(".u-av");
            if (avEl) {
              var initials = name.trim().split(/\s+/).map(function (p) { return p.charAt(0).toUpperCase(); }).slice(0, 2).join("");
              if (initials) avEl.textContent = initials;
            }
          })
          .catch(function (err) {
            showAlert("setNameAlert", (err && err.message) || tr("loadFailed"), false);
          })
          .finally(function () { saveNameBtn.disabled = false; });
      });
    }

    // پاس ورڈ اپڈیٹ کریں
    var savePwBtn = document.getElementById("setSavePwBtn");
    if (savePwBtn) {
      savePwBtn.addEventListener("click", function () {
        var pw = document.getElementById("setNewPw").value;
        var cpw = document.getElementById("setConfirmPw").value;

        if (!pw || pw.length < 8) { showAlert("setPwAlert", tr("pwTooShort"), false); return; }
        if (pw !== cpw) { showAlert("setPwAlert", tr("pwMismatch"), false); return; }

        savePwBtn.disabled = true;
        window.AlphaMindAuth.updatePassword(pw)
          .then(function () {
            showAlert("setPwAlert", tr("pwSaved"), true);
            document.getElementById("setNewPw").value = "";
            document.getElementById("setConfirmPw").value = "";
          })
          .catch(function (err) {
            showAlert("setPwAlert", (err && err.message) || tr("loadFailed"), false);
          })
          .finally(function () { savePwBtn.disabled = false; });
      });
    }
  }

  function escCloseOnce(e) {
    if (e.key === "Escape") closeModal();
  }

  function closeModal() {
    var wrap = document.getElementById("settingsModalRoot");
    if (wrap) wrap.remove();
    document.removeEventListener("keydown", escCloseOnce);
  }

  function renderLoadingModal() {
    injectStyles();
    var html = '<div class="set-overlay show" id="setOverlay"><div class="set-card">'
      + '<div class="set-hdr"><span class="set-title">⚙️ ' + tr("title") + '</span>'
      + '<button class="set-close" id="setCloseBtn" type="button">✕</button></div>'
      + '<div class="set-loading">' + tr("loading") + '</div>'
      + '</div></div>';

    var wrap = document.createElement("div");
    wrap.id = "settingsModalRoot";
    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    document.getElementById("setCloseBtn").addEventListener("click", closeModal);
    document.addEventListener("keydown", escCloseOnce);
  }

  /**
   * open() — پہلے موجودہ Supabase پروفائل ڈیٹا لاتا ہے، پھر مکمل
   * modal رینڈر کرتا ہے۔ یہی فنکشن Sidebar کے "Settings" بٹن سے بلانا ہے۔
   */
  function open() {
    renderLoadingModal();

    if (!window.AlphaMindAuth || !window.AlphaMindAuth.getProfile) {
      console.warn("[settings-panel] AlphaMindAuth.getProfile موجود نہیں — auth.js لوڈ چیک کریں۔");
      return;
    }

    window.AlphaMindAuth.getProfile()
      .then(function (profile) {
        var wrap = document.getElementById("settingsModalRoot");
        if (!wrap) return; // یوزر نے لوڈنگ کے دوران ہی بند کر دیا
        wrap.innerHTML = buildCardHtml(profile);
        requestAnimationFrame(function () {
          var overlay = document.getElementById("setOverlay");
          if (overlay) overlay.classList.add("show");
        });
        wireEvents(profile);
      })
      .catch(function (err) {
        console.warn("[settings-panel] getProfile failed:", err.message);
        var wrap = document.getElementById("settingsModalRoot");
        if (wrap) {
          wrap.innerHTML = '<div class="set-overlay show"><div class="set-card">'
            + '<div class="set-hdr"><span class="set-title">⚙️ ' + tr("title") + '</span>'
            + '<button class="set-close" id="setCloseBtn" type="button">✕</button></div>'
            + '<div class="set-loading">' + tr("loadFailed") + '</div></div></div>';
          document.getElementById("setCloseBtn").addEventListener("click", closeModal);
        }
      });
  }

  /* ================================================================
     PUBLIC API — window.AlphaMindSettings
  ================================================================ */
  window.AlphaMindSettings = {
    open: open
  };

  console.log("[AlphaMind] settings-panel.js loaded — Account Settings ready");

})();