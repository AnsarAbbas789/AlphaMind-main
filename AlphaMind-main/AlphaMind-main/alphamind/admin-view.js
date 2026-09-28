/**
 * AlphaMind — admin-view.js
 * =====================================================
 * Sidebar "Admin Panel" full-page view. Only reachable by users
 * with role="admin" (dashboard.html hides the nav button for
 * everyone else, and Supabase RLS enforces it server-side too).
 *
 * Lists all users from the `profiles` table (readable by admins
 * via the "Admins can view all profiles" RLS policy) and lets an
 * admin promote/demote another user's role. Requires the extra
 * "Admins can update any profile" RLS policy — see
 * supabase-admin-panel-update-policy.sql.
 *
 * Depends on: supabase-config.js (window.sb).
 * Exposes: window.AlphaMindAdmin { open, close, filter }
 * =====================================================
 */

"use strict";

(function () {

  var isViewOpen = false;
  var profiles = [];
  var filterText = "";
  var currentUserId = null;

  /* ================================================================
     LANG
  ================================================================ */
  function getLang() {
    try { return localStorage.getItem("alphamind_lang") || "en"; } catch (e) { return "en"; }
  }

  /* ================================================================
     SUPABASE HELPERS
  ================================================================ */
  function client() {
    if (typeof window.sb === "undefined") {
      throw new Error("Supabase client موجود نہیں — supabase-config.js پہلے لوڈ کریں۔");
    }
    return window.sb;
  }

  async function getUserId() {
    var res = await client().auth.getSession();
    if (res.error) throw res.error;
    var session = res.data.session;
    if (!session) throw new Error("not_logged_in");
    return session.user.id;
  }

  async function loadProfiles() {
    var res = await client()
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function updateRole(id, newRole) {
    var res = await client().from("profiles").update({ role: newRole }).eq("id", id);
    if (res.error) throw res.error;
  }

  /* ================================================================
     RENDER
  ================================================================ */
  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString();
  }

  function initials(name) {
    if (!name) return "?";
    return name.trim().split(/\s+/).map(function (p) { return p.charAt(0).toUpperCase(); }).slice(0, 2).join("");
  }

  function getVisibleRows() {
    if (!filterText) return profiles;
    var q = filterText.toLowerCase();
    return profiles.filter(function (p) {
      return (p.full_name || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderSummary() {
    var totalEl = document.getElementById("adTotalUsers");
    var adminsEl = document.getElementById("adTotalAdmins");
    if (totalEl) totalEl.textContent = profiles.length;
    if (adminsEl) adminsEl.textContent = profiles.filter(function (p) { return p.role === "admin"; }).length;
  }

  function render() {
    var tbody = document.getElementById("adminTableBody");
    if (!tbody) return;

    renderSummary();

    var rows = getVisibleRows();
    if (!rows.length) {
      var lang = getLang();
      var msg = lang === "ur" ? "کوئی یوزر نہیں ملا۔" : "No users found.";
      tbody.innerHTML = '<tr><td colspan="4"><div class="vp-empty">' + msg + '</div></td></tr>';
      return;
    }

    var lang = getLang();
    var promoteLbl = lang === "ur" ? "ایڈمن بنائیں" : "Promote to Admin";
    var demoteLbl  = lang === "ur" ? "یوزر بنائیں"   : "Demote to User";
    var youLbl     = lang === "ur" ? "آپ" : "You";

    tbody.innerHTML = rows.map(function (p) {
      var isAdmin = p.role === "admin";
      var isSelf = p.id === currentUserId;
      var roleLabel = isAdmin ? (lang === "ur" ? "ایڈمن" : "Admin") : (lang === "ur" ? "یوزر" : "User");

      var actionBtn = isSelf
        ? '<button class="ad-toggle-btn" disabled>' + youLbl + '</button>'
        : '<button class="ad-toggle-btn ' + (isAdmin ? "demote" : "") + '" onclick="window.AlphaMindAdmin.toggleRole(\'' + p.id + '\',\'' + (isAdmin ? "user" : "admin") + '\')">'
          + (isAdmin ? demoteLbl : promoteLbl) + '</button>';

      return '<tr>'
        + '  <td>'
        + '    <div class="ad-name-cell">'
        + '      <div class="ad-av">' + escapeHtml(initials(p.full_name)) + '</div>'
        + '      <span>' + escapeHtml(p.full_name || "—") + '</span>'
        + (isSelf ? '<span class="ad-you-tag">' + youLbl + '</span>' : '')
        + '    </div>'
        + '  </td>'
        + '  <td><span class="ad-role-badge ' + (isAdmin ? "admin" : "user") + '">' + roleLabel + '</span></td>'
        + '  <td>' + fmtDate(p.created_at) + '</td>'
        + '  <td>' + actionBtn + '</td>'
        + '</tr>';
    }).join("");
  }

  function renderLoading() {
    var tbody = document.getElementById("adminTableBody");
    if (!tbody) return;
    var rows = "";
    for (var i = 0; i < 5; i++) {
      rows += '<tr>'
        + '<td><div class="ad-name-cell"><div class="ad-av" style="background:var(--input-bg);"></div><div class="am-skel-row" style="width:110px;"></div></div></td>'
        + '<td><div class="am-skel-row" style="width:50px;"></div></td>'
        + '<td><div class="am-skel-row" style="width:70px;"></div></td>'
        + '<td><div class="am-skel-row" style="width:90px;"></div></td>'
        + '</tr>';
    }
    tbody.innerHTML = rows;
  }

  function renderLoadFailed() {
    var tbody = document.getElementById("adminTableBody");
    if (!tbody) return;
    var lang = getLang();
    tbody.innerHTML = '<tr><td colspan="4"><div class="vp-empty">' + (lang === "ur" ? "یوزر لسٹ لوڈ نہیں ہو سکی۔" : "Could not load users.") + '</div></td></tr>';
  }

  /* ================================================================
     ACTIONS
  ================================================================ */
  async function toggleRole(id, newRole) {
    var lang = getLang();
    var confirmMsg = newRole === "admin"
      ? (lang === "ur" ? "کیا آپ اس یوزر کو ایڈمن بنانا چاہتے ہیں؟" : "Promote this user to Admin?")
      : (lang === "ur" ? "کیا آپ اس ایڈمن کو عام یوزر بنانا چاہتے ہیں؟" : "Demote this admin to a regular user?");
    if (!confirm(confirmMsg)) return;

    try {
      await updateRole(id, newRole);
      var row = profiles.find(function (p) { return p.id === id; });
      if (row) row.role = newRole;
      render();
    } catch (err) {
      console.warn("[admin-view] toggleRole failed:", err.message);
      alert(lang === "ur" ? "کردار تبدیل کرنے میں خرابی ہوئی۔" : "Failed to change role.");
    }
  }

  /* ================================================================
     PUBLIC API
  ================================================================ */
  function open() {
    isViewOpen = true;
    renderLoading();

    getUserId()
      .then(function (uid) {
        currentUserId = uid;
        return loadProfiles();
      })
      .then(function (list) {
        if (!isViewOpen) return;
        profiles = list;
        render();
      })
      .catch(function (err) {
        console.warn("[admin-view] open failed:", err.message);
        if (isViewOpen) renderLoadFailed();
      });
  }

  function close() {
    isViewOpen = false;
  }

  function filter(v) {
    filterText = v || "";
    render();
  }

  window.AlphaMindAdmin = {
    open: open,
    close: close,
    filter: filter,
    toggleRole: toggleRole
  };

  console.log("[AlphaMind] admin-view.js loaded — Admin Panel ready");

})();