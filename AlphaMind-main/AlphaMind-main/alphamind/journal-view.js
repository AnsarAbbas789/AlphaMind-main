/**
 * AlphaMind — journal-view.js
 * =====================================================
 * Sidebar "Journal" full-page view. Supabase-backed trade journal:
 * title, optional coin symbol, free-text notes, mood (1-5).
 *
 * Depends on: supabase-config.js (window.sb), and the
 * `journal_entries` table + RLS from supabase-journal-setup.sql.
 *
 * Exposes: window.AlphaMindJournal
 *   .open()      -> load + render list, called when the view is shown
 *   .close()     -> stop background work, called when leaving the view
 *   .openForm()  -> show the new/edit entry form
 *   .closeForm() -> hide the form
 *   .save()      -> insert or update the entry currently in the form
 *   .edit(id)    -> populate the form from an existing entry
 *   .remove(id)  -> delete an entry (with confirm)
 * =====================================================
 */

"use strict";

(function () {

  var isViewOpen = false;
  var entries = [];
  var editingId = null;   // null = creating a new entry
  var selectedMood = null;

  /* ================================================================
     LANG
  ================================================================ */
  function getLang() {
    try { return localStorage.getItem("alphamind_lang") || "en"; } catch (e) { return "en"; }
  }

  function notify(msg, type) {
    if (window.AlphaMindToast) window.AlphaMindToast.show(msg, type);
    else alert(msg);
  }

  function confirmAction(msg, opts) {
    if (window.AlphaMindToast) return window.AlphaMindToast.confirm(msg, opts);
    return Promise.resolve(confirm(msg));
  }

  var MOOD_EMOJI = { 1: "😢", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

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

  async function loadEntries() {
    var uid = await getUserId();
    var res = await client()
      .from("journal_entries")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function insertEntry(row) {
    var uid = await getUserId();
    row.user_id = uid;
    var res = await client().from("journal_entries").insert(row).select();
    if (res.error) throw res.error;
    return res.data && res.data[0];
  }

  async function updateEntry(id, patch) {
    patch.updated_at = new Date().toISOString();
    var res = await client().from("journal_entries").update(patch).eq("id", id);
    if (res.error) throw res.error;
  }

  async function deleteEntry(id) {
    var res = await client().from("journal_entries").delete().eq("id", id);
    if (res.error) throw res.error;
  }

  /* ================================================================
     RENDER — LIST
  ================================================================ */
  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString() + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderList() {
    var listEl = document.getElementById("journalList");
    if (!listEl) return;

    if (!entries.length) {
      var lang = getLang();
      var msg = lang === "ur"
        ? "ابھی کوئی جرنل انٹری موجود نہیں۔ \"نئی انٹری\" سے شروع کریں۔"
        : "No journal entries yet. Start with \"New Entry\".";
      listEl.innerHTML = '<div class="vp-empty">' + msg + '</div>';
      return;
    }

    var lang = getLang();
    var editLbl = lang === "ur" ? "ترمیم" : "Edit";
    var delLbl  = lang === "ur" ? "حذف کریں" : "Delete";

    listEl.innerHTML = entries.map(function (e) {
      var symBadge = e.symbol ? '<span class="jr-card-sym">' + escapeHtml(e.symbol) + '</span>' : "";
      var moodEmoji = e.mood ? (MOOD_EMOJI[e.mood] || "") : "";
      return ''
        + '<div class="jr-card">'
        + '  <div class="jr-card-hdr">'
        + '    <div><span class="jr-card-title">' + escapeHtml(e.title) + '</span>' + symBadge + '</div>'
        + '    <div class="jr-card-meta">'
        + (moodEmoji ? '<span class="jr-card-mood">' + moodEmoji + '</span>' : '')
        + '      <span class="jr-card-time">' + fmtTime(e.created_at) + '</span>'
        + '    </div>'
        + '  </div>'
        + '  <div class="jr-card-body">' + escapeHtml(e.content) + '</div>'
        + '  <div class="jr-card-actions">'
        + '    <span class="jr-card-action" onclick="window.AlphaMindJournal.edit(\'' + e.id + '\')">' + editLbl + '</span>'
        + '    <span class="jr-card-action danger" onclick="window.AlphaMindJournal.remove(\'' + e.id + '\')">' + delLbl + '</span>'
        + '  </div>'
        + '</div>';
    }).join("");
  }

  function renderLoading() {
    var listEl = document.getElementById("journalList");
    if (!listEl) return;
    var cards = "";
    for (var i = 0; i < 3; i++) {
      cards += '<div class="jr-card">'
        + '<div class="am-skel-row" style="width:140px;margin-bottom:10px;"></div>'
        + '<div class="am-skel-row" style="width:100%;margin-bottom:6px;height:11px;"></div>'
        + '<div class="am-skel-row" style="width:80%;height:11px;"></div>'
        + '</div>';
    }
    listEl.innerHTML = cards;
  }

  function renderLoadFailed() {
    var listEl = document.getElementById("journalList");
    if (!listEl) return;
    var lang = getLang();
    listEl.innerHTML = '<div class="vp-empty">' + (lang === "ur" ? "جرنل لوڈ نہیں ہو سکا۔" : "Could not load journal.") + '</div>';
  }

  /* ================================================================
     FORM
  ================================================================ */
  function setMoodUI(mood) {
    selectedMood = mood;
    document.querySelectorAll(".jr-mood-btn").forEach(function (btn) {
      btn.classList.toggle("act", +btn.dataset.mood === mood);
    });
  }

  function bindMoodButtons() {
    document.querySelectorAll(".jr-mood-btn").forEach(function (btn) {
      btn.onclick = function () { setMoodUI(+btn.dataset.mood); };
    });
  }

  function openForm() {
    var form = document.getElementById("journalForm");
    if (!form) return;
    form.classList.add("open");
    document.getElementById("jrTitle").focus();
  }

  function closeForm() {
    var form = document.getElementById("journalForm");
    if (form) form.classList.remove("open");
    editingId = null;
    selectedMood = null;
    var titleEl = document.getElementById("jrTitle");
    var symEl = document.getElementById("jrSymbol");
    var contentEl = document.getElementById("jrContent");
    if (titleEl) titleEl.value = "";
    if (symEl) symEl.value = "";
    if (contentEl) contentEl.value = "";
    setMoodUI(null);
  }

  function edit(id) {
    var entry = entries.find(function (e) { return e.id === id; });
    if (!entry) return;

    editingId = id;
    document.getElementById("jrTitle").value = entry.title || "";
    document.getElementById("jrSymbol").value = entry.symbol || "";
    document.getElementById("jrContent").value = entry.content || "";
    setMoodUI(entry.mood || null);
    openForm();
  }

  async function remove(id) {
    var lang = getLang();
    var ok = await confirmAction(
      lang === "ur" ? "کیا آپ واقعی یہ انٹری حذف کرنا چاہتے ہیں؟" : "Delete this journal entry?",
      { confirmLabel: lang === "ur" ? "حذف کریں" : "Delete", cancelLabel: lang === "ur" ? "منسوخ کریں" : "Cancel", danger: true }
    );
    if (!ok) return;
    try {
      await deleteEntry(id);
      entries = entries.filter(function (e) { return e.id !== id; });
      renderList();
      notify(lang === "ur" ? "انٹری حذف ہو گئی۔" : "Entry deleted.", "success");
    } catch (err) {
      console.warn("[journal-view] delete failed:", err.message);
      notify(lang === "ur" ? "حذف کرنے میں خرابی ہوئی۔" : "Failed to delete entry.", "error");
    }
  }

  async function save() {
    var lang = getLang();
    var title = document.getElementById("jrTitle").value.trim();
    var symbol = document.getElementById("jrSymbol").value.trim().toUpperCase();
    var content = document.getElementById("jrContent").value.trim();

    if (!title) {
      notify(lang === "ur" ? "براہ کرم عنوان درج کریں۔" : "Please enter a title.", "error");
      return;
    }

    var saveBtn = document.getElementById("jrSaveBtn");
    if (saveBtn) saveBtn.disabled = true;

    try {
      if (editingId) {
        await updateEntry(editingId, {
          title: title, symbol: symbol || null, content: content, mood: selectedMood || null
        });
      } else {
        var created = await insertEntry({
          title: title, symbol: symbol || null, content: content, mood: selectedMood || null
        });
        if (created) entries.unshift(created);
      }

      if (editingId) {
        var idx = entries.findIndex(function (e) { return e.id === editingId; });
        if (idx !== -1) {
          entries[idx].title = title;
          entries[idx].symbol = symbol || null;
          entries[idx].content = content;
          entries[idx].mood = selectedMood || null;
        }
      }

      closeForm();
      renderList();
      notify(lang === "ur" ? "انٹری محفوظ ہو گئی۔" : "Entry saved.", "success");
    } catch (err) {
      console.warn("[journal-view] save failed:", err.message);
      notify(lang === "ur" ? "محفوظ کرنے میں خرابی ہوئی۔" : "Failed to save entry.", "error");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  /* ================================================================
     PUBLIC API
  ================================================================ */
  function open() {
    isViewOpen = true;
    bindMoodButtons();
    renderLoading();
    loadEntries()
      .then(function (list) {
        if (!isViewOpen) return; // user navigated away while loading
        entries = list;
        renderList();
      })
      .catch(function (err) {
        console.warn("[journal-view] loadEntries failed:", err.message);
        if (isViewOpen) renderLoadFailed();
      });
  }

  function close() {
    isViewOpen = false;
    closeForm();
  }

  window.AlphaMindJournal = {
    open: open,
    close: close,
    openForm: openForm,
    closeForm: closeForm,
    save: save,
    edit: edit,
    remove: remove
  };

  console.log("[AlphaMind] journal-view.js loaded — Journal view ready");

})();