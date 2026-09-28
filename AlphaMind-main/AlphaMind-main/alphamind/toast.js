/**
 * AlphaMind — toast.js
 * =====================================================
 * A single shared, theme-matched replacement for the browser's
 * native alert()/confirm() dialogs, used across settings-panel.js,
 * journal-view.js, portfolio-view.js, admin-view.js,
 * signal-history.js, and dashboard.html.
 *
 * Self-contained: injects its own styles and DOM, no dependency
 * on any other AlphaMind file. Loads early (no auth/session
 * requirement) so any module can call it immediately.
 *
 * Public API — window.AlphaMindToast:
 *   .show(message, type)     -> type: 'success' | 'error' | 'info' (default 'info')
 *   .confirm(message, opts)  -> returns a Promise<boolean>, opts: {confirmLabel, cancelLabel, danger}
 * =====================================================
 */

"use strict";

(function () {

  var TOAST_DURATION_MS = 4200;

  /* ================================================================
     STYLES
  ================================================================ */
  function injectStyles() {
    if (document.getElementById("alphamindToastStyles")) return;
    var css = ''
      + '.am-toast-stack{position:fixed;top:18px;inset-inline-end:18px;z-index:10000;'
      + 'display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:340px;}'
      + '.am-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;'
      + 'background:var(--card,#fff);color:var(--text,#1a1a1a);border:1px solid var(--border,#e7e9ee);'
      + 'border-radius:12px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.18);'
      + 'font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;font-size:.84rem;line-height:1.5;'
      + 'transform:translateX(120%);opacity:0;transition:transform .35s cubic-bezier(.16,1,.3,1),opacity .3s ease;'
      + 'border-inline-start:3px solid var(--gold,#d4af37);}'
      + '.am-toast.am-show{transform:translateX(0);opacity:1;}'
      + '.am-toast.am-leaving{transform:translateX(120%);opacity:0;}'
      + '.am-toast.success{border-inline-start-color:#2563eb;}'
      + '.am-toast.error{border-inline-start-color:#ef4444;}'
      + '.am-toast-icon{font-size:1rem;flex-shrink:0;line-height:1.4;}'
      + '.am-toast-msg{flex:1;}'
      + '.am-toast-close{background:none;border:none;color:var(--text-sec,#5b6472);cursor:pointer;'
      + 'font-size:.9rem;line-height:1;padding:2px;flex-shrink:0;opacity:.6;transition:opacity .15s;}'
      + '.am-toast-close:hover{opacity:1;}'
      + '[dir=rtl] .am-toast-stack{inset-inline-end:auto;inset-inline-start:18px;}'

      + '.am-confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;'
      + 'display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;'
      + 'transition:opacity .2s ease;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;}'
      + '.am-confirm-overlay.am-show{opacity:1;}'
      + '.am-confirm-card{background:var(--card,#fff);color:var(--text,#1a1a1a);width:100%;max-width:380px;'
      + 'border-radius:16px;border:1px solid var(--border,#e7e9ee);box-shadow:0 24px 64px rgba(0,0,0,.4);'
      + 'padding:22px 22px 18px;transform:scale(.94) translateY(8px);opacity:0;'
      + 'transition:transform .25s cubic-bezier(.16,1,.3,1),opacity .25s ease;}'
      + '.am-confirm-overlay.am-show .am-confirm-card{transform:scale(1) translateY(0);opacity:1;}'
      + '.am-confirm-msg{font-size:.9rem;line-height:1.6;margin-bottom:18px;color:var(--text,#1a1a1a);}'
      + '.am-confirm-actions{display:flex;gap:9px;}'
      + '.am-confirm-btn{flex:1;border:none;border-radius:10px;padding:10px 14px;font-size:.84rem;'
      + 'font-weight:700;cursor:pointer;transition:opacity .2s,transform .1s;font-family:inherit;}'
      + '.am-confirm-btn:active{transform:scale(.98);}'
      + '.am-confirm-btn.cancel{background:none;border:1.5px solid var(--border,#e7e9ee);color:var(--text-sec,#5b6472);}'
      + '.am-confirm-btn.ok{background:var(--blue-deep,#1a2b4c);color:#fff;}'
      + '.am-confirm-btn.ok.danger{background:#ef4444;}'
      + '[data-theme="dark"] .am-confirm-btn.ok{background:var(--gold,#d4af37);color:#1a1a1a;}'
      + '@media(prefers-reduced-motion:reduce){.am-toast,.am-confirm-overlay,.am-confirm-card{transition-duration:.001ms !important;}}';

    var tag = document.createElement("style");
    tag.id = "alphamindToastStyles";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function ensureStack() {
    var stack = document.getElementById("amToastStack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "amToastStack";
      stack.className = "am-toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  var ICONS = { success: "✓", error: "!", info: "ℹ" };

  /* ================================================================
     TOAST
  ================================================================ */
  function show(message, type) {
    injectStyles();
    type = (type === "success" || type === "error") ? type : "info";
    var stack = ensureStack();

    var el = document.createElement("div");
    el.className = "am-toast " + type;
    el.innerHTML = '<span class="am-toast-icon">' + (ICONS[type] || ICONS.info) + '</span>'
      + '<span class="am-toast-msg"></span>'
      + '<button class="am-toast-close" type="button" aria-label="Close">✕</button>';
    el.querySelector(".am-toast-msg").textContent = message;

    stack.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("am-show"); });

    var timer = setTimeout(function () { dismiss(); }, TOAST_DURATION_MS);

    function dismiss() {
      clearTimeout(timer);
      el.classList.add("am-leaving");
      el.classList.remove("am-show");
      setTimeout(function () { el.remove(); }, 320);
    }

    el.querySelector(".am-toast-close").addEventListener("click", dismiss);
  }

  /* ================================================================
     CONFIRM — Promise-based, replaces window.confirm()
  ================================================================ */
  function confirmDialog(message, opts) {
    opts = opts || {};
    injectStyles();

    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.className = "am-confirm-overlay";
      overlay.innerHTML = ''
        + '<div class="am-confirm-card">'
        + '  <div class="am-confirm-msg"></div>'
        + '  <div class="am-confirm-actions">'
        + '    <button class="am-confirm-btn cancel" type="button"></button>'
        + '    <button class="am-confirm-btn ok' + (opts.danger ? ' danger' : '') + '" type="button"></button>'
        + '  </div>'
        + '</div>';

      overlay.querySelector(".am-confirm-msg").textContent = message;
      overlay.querySelector(".cancel").textContent = opts.cancelLabel || "Cancel";
      overlay.querySelector(".ok").textContent = opts.confirmLabel || "Confirm";

      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add("am-show"); });

      function close(result) {
        overlay.classList.remove("am-show");
        setTimeout(function () { overlay.remove(); }, 220);
        resolve(result);
      }

      overlay.querySelector(".cancel").addEventListener("click", function () { close(false); });
      overlay.querySelector(".ok").addEventListener("click", function () { close(true); });
      overlay.addEventListener("click", function (e) { if (e.target === overlay) close(false); });

      function escHandler(e) {
        if (e.key === "Escape") { close(false); document.removeEventListener("keydown", escHandler); }
      }
      document.addEventListener("keydown", escHandler);
    });
  }

  window.AlphaMindToast = {
    show: show,
    confirm: confirmDialog
  };

  console.log("[AlphaMind] toast.js loaded — AlphaMindToast ready");

})();