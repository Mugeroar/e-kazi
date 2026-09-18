/**
 * BrandInn Prints — Shared Page Module v2.1
 * ------------------------------------------
 * Fix: submit button outside <form> now correctly triggers submission
 * via form.requestSubmit() with a dispatchEvent fallback.
 */

import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  getDatabase, ref, onValue, push, set, update, remove, get
} from "firebase/database";

// ---------------- Firebase ----------------
const firebaseConfig = {
  apiKey: "AIzaSyC7kppUyHUaPzeLBV62NEZWuHiuz1Kz0mA",
  authDomain: "mugera-e51cc.firebaseapp.com",
  databaseURL: "https://mugera-e51cc-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mugera-e51cc",
  storageBucket: "mugera-e51cc.firebasestorage.app",
  messagingSenderId: "1024868637509",
  appId: "1:1024868637509:web:321faecddce8f11d9cfc2c"
};

const LOGIN_URL = "https://kazinni-staff.vercel.app";
const DASHBOARD_URL = "/workspaces/brandinn-print/dashboard.html";

let app, auth, db, initialized = false;

export function initFirebase() {
  if (initialized) return { app, auth, db };
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  initialized = true;
  return { app, auth, db };
}

// ---------------- Utilities ----------------
export function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, m =>
    m === "&" ? "&amp;" : m === "<" ? "&lt;" : m === ">" ? "&gt;" : m === '"' ? "&quot;" : "&#39;"
  );
}

export function initials(name) {
  if (!name) return "?";
  const c = String(name).trim().replace(/\s+/g, " ");
  if (!c) return "?";
  return c.split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase().substring(0, 2);
}

export function statusClass(s) {
  const m = {
    active:"status-active", pending:"status-pending", planning:"status-planning",
    "in-progress":"status-in-progress", new:"status-new", printing:"status-printing",
    completed:"status-completed", delivered:"status-completed", cancelled:"status-cancelled",
    confirmed:"status-confirmed", low:"status-low", ok:"status-ok", quoted:"status-quoted",
    approved:"status-approved", processing:"status-processing", "on-hold":"status-pending",
    draft:"status-pending", sent:"status-info", accepted:"status-active", rejected:"status-cancelled"
  };
  return m[(s || "").toLowerCase()] || "status-pending";
}

export function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatMoney(n) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return "KSh " + v.toLocaleString();
}

export function formatRelative(ts) {
  if (!ts) return "";
  const d = Date.now() - Number(ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

// ---------------- Firebase ops ----------------
export function requireAuth(onReady) {
  const { auth: a } = initFirebase();
  onAuthStateChanged(a, (user) => {
    if (!user) { window.location.href = LOGIN_URL; return; }
    onReady(user);
  });
}

export function listenNode(node, onData, onError) {
  const { db: d } = initFirebase();
  let warned = false;
  try {
    const unsub = onValue(ref(d, node), (snap) => onData(snap.val() || {}), (err) => {
      if (!warned) { warned = true; console.warn(`[Prints] "${node}":`, err?.message || err); }
      if (onError) onError(err);
      onData({});
    });
    return unsub;
  } catch (err) {
    console.warn(`[Prints] attach "${node}":`, err?.message || err);
    if (onError) onError(err);
    onData({});
    return () => {};
  }
}

export async function createRecord(node, data) {
  const { db: d, auth: a } = initFirebase();
  const newRef = push(ref(d, node));
  await set(newRef, {
    ...data,
    createdAt: Date.now(),
    createdBy: a.currentUser?.email || "",
  });
  return newRef.key;
}

export async function updateRecord(node, id, patch) {
  const { db: d, auth: a } = initFirebase();
  await update(ref(d, `${node}/${id}`), {
    ...patch,
    updatedAt: Date.now(),
    updatedBy: a.currentUser?.email || "",
  });
}

export async function deleteRecord(node, id) {
  const { db: d } = initFirebase();
  await remove(ref(d, `${node}/${id}`));
}

// ---------------- Toast system ----------------
function ensureToastHost() {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  return host;
}

export function toast(message, type = "info", duration = 3500) {
  const host = ensureToastHost();
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const icon = { success:"fa-check-circle", error:"fa-exclamation-circle", info:"fa-info-circle", warning:"fa-exclamation-triangle" }[type] || "fa-info-circle";
  el.innerHTML = `<i class="fas ${icon}"></i><span>${esc(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast-show"));
  setTimeout(() => {
    el.classList.remove("toast-show");
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ---------------- Modal system ----------------
/**
 * Opens a modal. Returns a Promise that resolves with the form values (or null if cancelled).
 */
export function openModal(config) {
  return new Promise((resolve) => {
    const {
      title = "Form",
      subtitle = "",
      fields = [],
      submitLabel = "Save",
      cancelLabel = "Cancel",
      size = "md",
      onSubmit,
      initialValues = {},
    } = config;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    const modal = document.createElement("div");
    modal.className = `modal modal-${size}`;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const header = document.createElement("div");
    header.className = "modal-header";
    header.innerHTML = `
      <div>
        <h2>${esc(title)}</h2>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
      </div>
      <button class="modal-close" type="button" aria-label="Close"><i class="fas fa-times"></i></button>
    `;

    const body = document.createElement("div");
    body.className = "modal-body";

    const form = document.createElement("form");
    form.className = "modal-form";
    form.noValidate = true;

    fields.forEach(f => {
      const fieldWrap = document.createElement("div");
      fieldWrap.className = `field field-${f.type || "text"}`;
      const id = `f_${f.key}_${Math.random().toString(36).slice(2, 7)}`;
      const val = initialValues[f.key] ?? f.defaultValue ?? "";

      let inputHtml = "";
      const t = f.type || "text";
      const baseAttrs = `id="${id}" name="${esc(f.key)}" placeholder="${esc(f.placeholder || "")}"${f.required ? " required" : ""}`;

      if (t === "textarea") {
        inputHtml = `<textarea ${baseAttrs} rows="${f.rows || 3}">${esc(val)}</textarea>`;
      } else if (t === "select") {
        const opts = (f.options || []).map(o => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? (o.charAt(0).toUpperCase() + o.slice(1).replace("-", " ")) : o.label;
          const sel = String(val) === String(v) ? " selected" : "";
          return `<option value="${esc(v)}"${sel}>${esc(l)}</option>`;
        }).join("");
        inputHtml = `<select ${baseAttrs}>${f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : ""}${opts}</select>`;
      } else {
        const attrs = `${baseAttrs} type="${t}" value="${esc(val)}"`;
        const min = f.min !== undefined ? ` min="${f.min}"` : "";
        const max = f.max !== undefined ? ` max="${f.max}"` : "";
        const step = f.step !== undefined ? ` step="${f.step}"` : "";
        const inputmode = (t === "number" || t === "tel") ? ` inputmode="numeric"` : "";
        inputHtml = `<input ${attrs}${min}${max}${step}${inputmode}>`;
      }

      fieldWrap.innerHTML = `
        <label for="${id}">
          ${esc(f.label)}${f.required ? ` <span class="req">*</span>` : ""}
        </label>
        ${inputHtml}
        ${f.help ? `<small class="help">${esc(f.help)}</small>` : ""}
        <div class="field-error" data-error-for="${id}"></div>
      `;
      form.appendChild(fieldWrap);
    });

    body.appendChild(form);

    // Footer (still outside the form for layout)
    const footer = document.createElement("div");
    footer.className = "modal-footer";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-secondary";
    cancelBtn.textContent = cancelLabel;

    // ✅ FIX: type="button" not "submit" — since it's outside the form
    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "btn-primary";
    submitBtn.innerHTML = `<span>${esc(submitLabel)}</span>`;

    footer.appendChild(cancelBtn);
    footer.appendChild(submitBtn);

    // Assemble
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => backdrop.classList.add("modal-show"));

    setTimeout(() => {
      const first = form.querySelector("input, textarea, select");
      if (first) first.focus();
    }, 100);

    // ---- Validation ----
    function validateField(fieldEl) {
      const input = fieldEl.querySelector("input, textarea, select");
      if (!input) return true;
      const errBox = fieldEl.querySelector(".field-error");
      const spec = fields.find(f => f.key === input.name);
      const val = (input.value || "").trim();
      let error = "";

      if (spec?.required && !val) error = `${spec.label} is required.`;
      else if (val && input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) error = "Enter a valid email.";
      else if (val && input.type === "number" && isNaN(Number(val))) error = "Enter a valid number.";
      else if (val && input.type === "tel" && !/^[+\d][\d\s\-()]*$/.test(val)) error = "Enter a valid phone number.";
      else if (spec?.min !== undefined && input.type === "number" && Number(val) < spec.min) error = `Minimum is ${spec.min}.`;

      if (errBox) errBox.textContent = error;
      fieldEl.classList.toggle("field-invalid", !!error);
      return !error;
    }

    form.querySelectorAll(".field").forEach(fieldEl => {
      const input = fieldEl.querySelector("input, textarea, select");
      if (!input) return;
      input.addEventListener("blur", () => validateField(fieldEl));
      input.addEventListener("input", () => {
        if (fieldEl.classList.contains("field-invalid")) validateField(fieldEl);
      });
    });

    // ---- Close logic ----
    function close(result) {
      backdrop.classList.remove("modal-show");
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      setTimeout(() => {
        backdrop.remove();
        resolve(result);
      }, 220);
    }

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(null); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitBtn.click();
      }
    }
    document.addEventListener("keydown", onKey);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(null);
    });
    header.querySelector(".modal-close").addEventListener("click", () => close(null));
    cancelBtn.addEventListener("click", () => close(null));

    // ---- Submit logic (called from both form submit AND button click) ----
    async function doSubmit() {
      const values = {};
      let allValid = true;
      form.querySelectorAll(".field").forEach(fieldEl => {
        const ok = validateField(fieldEl);
        if (!ok) allValid = false;
        const input = fieldEl.querySelector("input, textarea, select");
        if (input) {
          const spec = fields.find(f => f.key === input.name);
          let v = input.value;
          if (spec?.type === "number") v = v === "" ? null : Number(v);
          else v = typeof v === "string" ? v.trim() : v;
          values[input.name] = v;
        }
      });

      if (!allValid) {
        const firstInvalid = form.querySelector(".field-invalid input, .field-invalid textarea, .field-invalid select");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // Loading state
      submitBtn.disabled = true;
      const original = submitBtn.innerHTML;
      submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${esc(submitLabel)}...</span>`;

      try {
        if (onSubmit) {
          const result = await onSubmit(values);
          if (result === false) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = original;
            return;
          }
        }
        close(values);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = original;
        toast(err?.message || "Something went wrong.", "error");
      }
    }

    // Form submit (fires on Enter keypress inside form)
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSubmit();
    });

    // ✅ FIX: Wire the footer button to trigger submission
    submitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      doSubmit();
    });
  });
}

// ---------------- Confirmation dialog ----------------
export function confirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "modal modal-sm modal-confirm";
    modal.setAttribute("role", "alertdialog");

    modal.innerHTML = `
      <div class="modal-header">
        <div><h2>${esc(title)}</h2></div>
      </div>
      <div class="modal-body">
        <p class="confirm-message">${esc(message)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-role="cancel" type="button">${esc(cancelLabel)}</button>
        <button class="${danger ? "btn-danger" : "btn-primary"}" data-role="confirm" type="button">${esc(confirmLabel)}</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => backdrop.classList.add("modal-show"));

    function close(result) {
      backdrop.classList.remove("modal-show");
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      setTimeout(() => { backdrop.remove(); resolve(result); }, 200);
    }

    function onKey(e) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    }
    document.addEventListener("keydown", onKey);

    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(false); });
    modal.querySelector('[data-role="cancel"]').addEventListener("click", () => close(false));
    modal.querySelector('[data-role="confirm"]').addEventListener("click", () => close(true));

    setTimeout(() => modal.querySelector('[data-role="confirm"]').focus(), 100);
  });
}

// ---------------- Detail drawer ----------------
export function openDrawer({ title, subtitle, fields, initialValues = {}, onSave, onDelete }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";

    const drawer = document.createElement("aside");
    drawer.className = "drawer";
    drawer.setAttribute("role", "dialog");

    drawer.innerHTML = `
      <header class="drawer-header">
        <div>
          <h2>${esc(title)}</h2>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
        </div>
        <button class="modal-close" type="button" aria-label="Close"><i class="fas fa-times"></i></button>
      </header>
      <div class="drawer-body">
        <form class="modal-form drawer-form" novalidate></form>
      </div>
      <footer class="drawer-footer">
        ${onDelete ? `<button type="button" class="btn-danger-ghost" data-role="delete"><i class="fas fa-trash"></i> Delete</button>` : ""}
        <div class="drawer-footer-right">
          <button type="button" class="btn-secondary" data-role="cancel">Cancel</button>
          <button type="button" class="btn-primary" data-role="save">Save changes</button>
        </div>
      </footer>
    `;

    backdrop.appendChild(drawer);
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => backdrop.classList.add("drawer-show"));

    const form = drawer.querySelector(".drawer-form");

    fields.forEach(f => {
      const wrap = document.createElement("div");
      wrap.className = `field field-${f.type || "text"}`;
      const id = `d_${f.key}_${Math.random().toString(36).slice(2, 7)}`;
      const val = initialValues[f.key] ?? "";
      const t = f.type || "text";
      const baseAttrs = `id="${id}" name="${esc(f.key)}" placeholder="${esc(f.placeholder || "")}"`;

      let inputHtml = "";
      if (t === "textarea") inputHtml = `<textarea ${baseAttrs} rows="${f.rows || 3}">${esc(val)}</textarea>`;
      else if (t === "select") {
        const opts = (f.options || []).map(o => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? (o.charAt(0).toUpperCase() + o.slice(1).replace("-", " ")) : o.label;
          return `<option value="${esc(v)}"${String(val) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
        }).join("");
        inputHtml = `<select ${baseAttrs}>${opts}</select>`;
      } else {
        inputHtml = `<input ${baseAttrs} type="${t}" value="${esc(val)}">`;
      }

      wrap.innerHTML = `
        <label for="${id}">${esc(f.label)}${f.required ? ` <span class="req">*</span>` : ""}</label>
        ${inputHtml}
        ${f.help ? `<small class="help">${esc(f.help)}</small>` : ""}
      `;
      form.appendChild(wrap);
    });

    function close(result) {
      backdrop.classList.remove("drawer-show");
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      setTimeout(() => { backdrop.remove(); resolve(result); }, 260);
    }

    function onKey(e) { if (e.key === "Escape") close(null); }
    document.addEventListener("keydown", onKey);

    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(null); });
    drawer.querySelector(".modal-close").addEventListener("click", () => close(null));
    drawer.querySelector('[data-role="cancel"]').addEventListener("click", () => close(null));

    drawer.querySelector('[data-role="save"]').addEventListener("click", async () => {
      const btn = drawer.querySelector('[data-role="save"]');
      const values = {};
      form.querySelectorAll("input, textarea, select").forEach(inp => {
        const spec = fields.find(f => f.key === inp.name);
        let v = inp.value;
        if (spec?.type === "number") v = v === "" ? null : Number(v);
        else v = typeof v === "string" ? v.trim() : v;
        values[inp.name] = v;
      });
      btn.disabled = true;
      const old = btn.innerHTML;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
      try {
        if (onSave) await onSave(values);
        toast("Saved successfully.", "success");
        close(values);
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = old;
        toast(err?.message || "Save failed.", "error");
      }
    });

    if (onDelete) {
      drawer.querySelector('[data-role="delete"]').addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: "Delete item?",
          message: "This action cannot be undone.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        try {
          await onDelete();
          toast("Deleted.", "success");
          close("deleted");
        } catch (err) {
          toast(err?.message || "Delete failed.", "error");
        }
      });
    }
  });
}

// ---------------- Generic list page ----------------
export function bootstrapListPage(config) {
  const {
    node, containerId,
    searchFields = [],
    statusField = "status",
    statusOptions = [],
    filterFn, sortFn, renderCard,
    emptyMessage = "Nothing here yet",
    emptyIcon = "fa-inbox",
    emptyCta = "Create first item",
    onCreate,
    onCardClick,
    createLabel = "New",
    createIcon = "fa-plus",
  } = config;

  const container = document.getElementById(containerId);
  const searchInput = document.getElementById("searchInput");
  const statusSelect = document.getElementById("statusFilter");
  const newBtn = document.getElementById("newBtn");

  if (statusSelect && statusOptions.length) {
    statusOptions.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");
      statusSelect.appendChild(opt);
    });
  }

  if (newBtn) {
    newBtn.innerHTML = `<i class="fas ${createIcon}"></i> ${esc(createLabel)}`;
  }

  let allItems = {};
  let unsub = null;
  let loading = true;

  function currentState() {
    return {
      query: (searchInput?.value || "").toLowerCase().trim(),
      status: statusSelect?.value || "",
    };
  }

  function applyFilters(items) {
    const state = currentState();
    let list = items;
    if (state.query && searchFields.length) {
      list = list.filter(item => searchFields.some(f => String(item[f] || "").toLowerCase().includes(state.query)));
    }
    if (state.status && statusField) {
      list = list.filter(item => String(item[statusField] || "").toLowerCase() === state.status.toLowerCase());
    }
    if (filterFn) list = list.filter(item => filterFn(item, state));
    if (sortFn) list.sort(sortFn);
    else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list;
  }

  function render() {
    if (!container) return;

    if (loading) {
      container.className = "item-grid";
      container.innerHTML = Array(6).fill(0).map(() => `
        <div class="item-card skeleton-card">
          <div class="skeleton skeleton-line" style="width:70%;height:1.2rem;margin-bottom:0.8rem;"></div>
          <div class="skeleton skeleton-line" style="width:50%;"></div>
          <div class="skeleton skeleton-line" style="width:40%;margin-top:1rem;"></div>
        </div>
      `).join("");
      return;
    }

    const items = Object.entries(allItems).map(([id, v]) => ({ id, ...v })).filter(v => v && typeof v === "object");
    const filtered = applyFilters(items);

    if (!filtered.length) {
      const hasFilters = currentState().query || currentState().status;
      container.className = "empty-state";
      container.innerHTML = `
        <i class="fas ${emptyIcon}"></i>
        <h3>${hasFilters ? "No matches" : esc(emptyMessage)}</h3>
        <p>${hasFilters ? "Try adjusting your search or filters." : "Get started by creating your first entry."}</p>
        ${!hasFilters && onCreate ? `<button class="btn-primary empty-cta" id="emptyCta"><i class="fas fa-plus"></i> ${esc(emptyCta)}</button>` : ""}
      `;
      const cta = document.getElementById("emptyCta");
      if (cta && onCreate) cta.addEventListener("click", handleCreate);
      return;
    }

    container.className = "item-grid";
    container.innerHTML = filtered.map(item => {
      const html = renderCard(item, item.id);
      return `<div class="item-card${onCardClick ? " clickable" : ""}" data-id="${esc(item.id)}" tabindex="${onCardClick ? "0" : "-1"}">${html}</div>`;
    }).join("");

    if (onCardClick) {
      container.querySelectorAll(".item-card.clickable").forEach(el => {
        const trigger = () => {
          const id = el.getAttribute("data-id");
          const item = allItems[id];
          if (item) onCardClick({ id, ...item }, id);
        };
        el.addEventListener("click", trigger);
        el.addEventListener("keydown", e => { if (e.key === "Enter") trigger(); });
      });
    }
  }

  async function handleCreate() {
    if (!onCreate) return;
    try {
      await onCreate();
    } catch (err) {
      if ((err?.message || "").includes("permission")) {
        toast(`Rules not set for "${node}". Add the write rule to enable saving.`, "warning", 6000);
      } else {
        toast(err?.message || "Failed.", "error");
      }
    }
  }

  if (searchInput) searchInput.addEventListener("input", render);
  if (statusSelect) statusSelect.addEventListener("change", render);
  if (newBtn && onCreate) newBtn.addEventListener("click", handleCreate);

  requireAuth(() => {
    unsub = listenNode(node, (data) => {
      allItems = data;
      loading = false;
      render();
    });
  });

  window.addEventListener("beforeunload", () => { try { unsub && unsub(); } catch (_) {} });

  return { refresh: render, getItems: () => allItems };
}

// ---------------- Create helper ----------------
export async function createViaModal(node, { title, subtitle, fields, submitLabel = "Create", extraFields = {} }) {
  const values = await openModal({ title, subtitle, fields, submitLabel });
  if (!values) return null;
  try {
    const payload = { ...values, ...extraFields };
    const id = await createRecord(node, payload);
    toast("Created successfully.", "success");
    return id;
  } catch (err) {
    if ((err?.message || "").includes("permission")) {
      toast(`Node "${node}" has no write rule yet. Add it in Firebase to enable saving.`, "warning", 7000);
    } else {
      toast(err?.message || "Save failed.", "error");
    }
    throw err;
  }
}

// ---------------- Shared styles ----------------
export function injectSharedStyles() {
  if (document.getElementById("prints-shared-styles")) return;

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; overflow-x: hidden; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f8fafc; color: #1e293b; line-height: 1.5; min-height: 100vh;
    }

    .container { width: 100%; max-width: 1400px; margin: 0 auto; padding: 2rem; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    .page-header h1 { font-size: 1.5rem; font-weight: 800; display: flex; align-items: center; gap: 10px; color: #0f172a; }
    .page-header h1 i { color: #7c3aed; }
    .page-header p { color: #64748b; font-size: 0.85rem; margin-top: 0.3rem; }

    .toolbar {
      background: white; border-radius: 16px; padding: 1rem 1.2rem;
      border: 1px solid #e2e8f0; margin-bottom: 1.5rem;
      display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .toolbar input, .toolbar select {
      padding: 0.6rem 1rem; border: 1px solid #e2e8f0; border-radius: 12px;
      font-size: 0.85rem; font-family: inherit; background: #f8fafc;
      transition: all 0.15s;
    }
    .toolbar input:focus, .toolbar select:focus {
      outline: none; border-color: #7c3aed; background: white;
      box-shadow: 0 0 0 3px rgba(124,58,237,0.1);
    }
    .toolbar input { flex: 1; min-width: 200px; }

    .btn-primary, .btn-secondary, .btn-danger, .btn-danger-ghost {
      border: none; padding: 0.65rem 1.3rem; border-radius: 12px;
      font-weight: 700; font-size: 0.85rem; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px;
      transition: all 0.15s; font-family: inherit;
    }
    .btn-primary { background: #7c3aed; color: white; }
    .btn-primary:hover:not(:disabled) { background: #5b21b6; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(124,58,237,0.25); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-secondary { background: #f1f5f9; color: #475569; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-danger-ghost { background: transparent; color: #ef4444; }
    .btn-danger-ghost:hover { background: #fee2e2; }

    .item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
    .item-card {
      background: white; border-radius: 16px; padding: 1.2rem;
      border: 1px solid #e2e8f0; transition: all 0.2s;
    }
    .item-card.clickable { cursor: pointer; }
    .item-card:hover { border-color: #c4b5fd; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(124,58,237,0.08); }
    .item-card:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.15); }
    .item-card h3 { font-size: 1rem; font-weight: 700; margin-bottom: 0.4rem; color: #0f172a; }
    .item-card .meta { color: #64748b; font-size: 0.75rem; margin-bottom: 0.8rem; }
    .item-card .row { display: flex; justify-content: space-between; align-items: center; margin-top: 0.8rem; gap: 8px; }

    .status-tag { padding: 0.25rem 0.7rem; border-radius: 20px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
    .status-active      { background: #d1fae5; color: #065f46; }
    .status-pending     { background: #fef3c7; color: #92400e; }
    .status-planning    { background: #fef3c7; color: #92400e; }
    .status-in-progress { background: #dbeafe; color: #1e40af; }
    .status-new         { background: #dbeafe; color: #1e40af; }
    .status-printing    { background: #ede9fe; color: #5b21b6; }
    .status-completed   { background: #d1fae5; color: #065f46; }
    .status-cancelled   { background: #fee2e2; color: #991b1b; }
    .status-confirmed   { background: #d1fae5; color: #065f46; }
    .status-low         { background: #fee2e2; color: #991b1b; }
    .status-ok          { background: #d1fae5; color: #065f46; }
    .status-quoted      { background: #e0e7ff; color: #3730a3; }
    .status-approved    { background: #d1fae5; color: #065f46; }
    .status-processing  { background: #fef3c7; color: #92400e; }
    .status-info        { background: #dbeafe; color: #1e40af; }

    .empty-state { text-align: center; padding: 3rem 1rem; color: #94a3b8; }
    .empty-state i { font-size: 2.5rem; display: block; margin-bottom: 0.8rem; opacity: 0.4; color: #7c3aed; }
    .empty-state h3 { font-size: 1.1rem; color: #475569; margin-bottom: 0.3rem; font-weight: 700; }
    .empty-state p { font-size: 0.85rem; margin-bottom: 1.2rem; }
    .empty-cta { margin-top: 0.5rem; }
    .loading { text-align: center; padding: 3rem; color: #94a3b8; }

    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .skeleton, .skeleton-line {
      background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 8px;
    }
    .skeleton-line { height: 0.85rem; margin-bottom: 0.5rem; }
    .skeleton-card { pointer-events: none; }

    .toast-host {
      position: fixed; bottom: 24px; right: 24px;
      display: flex; flex-direction: column; gap: 10px;
      z-index: 10000; pointer-events: none;
    }
    .toast {
      background: white; padding: 0.9rem 1.2rem; border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      display: flex; align-items: center; gap: 12px;
      font-size: 0.85rem; font-weight: 500; color: #1e293b;
      min-width: 260px; max-width: 400px;
      transform: translateX(120%); opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: auto; border-left: 4px solid #7c3aed;
    }
    .toast-show { transform: translateX(0); opacity: 1; }
    .toast i { font-size: 1.1rem; }
    .toast-success { border-left-color: #10b981; }
    .toast-success i { color: #10b981; }
    .toast-error { border-left-color: #ef4444; }
    .toast-error i { color: #ef4444; }
    .toast-warning { border-left-color: #f59e0b; }
    .toast-warning i { color: #f59e0b; }
    .toast-info i { color: #7c3aed; }

    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15,23,42,0.5);
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem; z-index: 9999;
      opacity: 0; transition: opacity 0.2s;
    }
    .modal-backdrop.modal-show { opacity: 1; }

    .modal {
      background: white; border-radius: 20px; width: 100%;
      max-height: 90vh; display: flex; flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      transform: translateY(20px) scale(0.97);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .modal-backdrop.modal-show .modal { transform: translateY(0) scale(1); }
    .modal-sm { max-width: 420px; }
    .modal-md { max-width: 560px; }
    .modal-lg { max-width: 720px; }

    .modal-header {
      padding: 1.5rem 1.5rem 0.8rem;
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 1px solid #f1f5f9;
    }
    .modal-header h2 { font-size: 1.2rem; font-weight: 800; color: #0f172a; }
    .modal-header p { color: #64748b; font-size: 0.8rem; margin-top: 0.2rem; }
    .modal-close {
      background: #f1f5f9; border: none; width: 32px; height: 32px;
      border-radius: 10px; cursor: pointer; color: #64748b;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; flex-shrink: 0;
    }
    .modal-close:hover { background: #fee2e2; color: #ef4444; }

    .modal-body { padding: 1.2rem 1.5rem; overflow-y: auto; flex: 1; }
    .modal-form { display: flex; flex-direction: column; gap: 1rem; }

    .field { display: flex; flex-direction: column; gap: 0.35rem; }
    .field label {
      font-size: 0.8rem; font-weight: 600; color: #334155;
      display: flex; align-items: center; gap: 6px;
    }
    .field .req { color: #ef4444; font-weight: 700; }
    .field input, .field textarea, .field select {
      padding: 0.7rem 1rem; border: 1.5px solid #e2e8f0; border-radius: 12px;
      font-family: inherit; font-size: 0.88rem; color: #0f172a;
      background: #f8fafc; transition: all 0.15s;
      width: 100%;
    }
    .field input:focus, .field textarea:focus, .field select:focus {
      outline: none; border-color: #7c3aed; background: white;
      box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
    }
    .field textarea { resize: vertical; min-height: 80px; font-family: inherit; }
    .field .help { font-size: 0.72rem; color: #94a3b8; }
    .field-error {
      color: #ef4444; font-size: 0.75rem; min-height: 1rem;
      font-weight: 500; display: none;
    }
    .field-invalid input, .field-invalid textarea, .field-invalid select {
      border-color: #ef4444; background: #fef2f2;
    }
    .field-invalid .field-error { display: block; }

    .modal-footer {
      padding: 1rem 1.5rem 1.5rem; display: flex; gap: 0.6rem;
      justify-content: flex-end; border-top: 1px solid #f1f5f9;
    }

    .modal-confirm .modal-body { padding: 1rem 1.5rem; }
    .confirm-message { color: #475569; font-size: 0.9rem; line-height: 1.6; }

    .drawer-backdrop {
      position: fixed; inset: 0; background: rgba(15,23,42,0.4);
      backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
      z-index: 9998; opacity: 0; transition: opacity 0.25s;
    }
    .drawer-backdrop.drawer-show { opacity: 1; }
    .drawer {
      position: absolute; top: 0; right: 0; bottom: 0;
      width: 100%; max-width: 520px; background: white;
      display: flex; flex-direction: column;
      box-shadow: -20px 0 40px rgba(0,0,0,0.15);
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .drawer-backdrop.drawer-show .drawer { transform: translateX(0); }
    .drawer-header {
      padding: 1.5rem; display: flex; justify-content: space-between;
      align-items: flex-start; border-bottom: 1px solid #f1f5f9;
    }
    .drawer-header h2 { font-size: 1.15rem; font-weight: 800; color: #0f172a; }
    .drawer-header p { color: #64748b; font-size: 0.8rem; margin-top: 0.2rem; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 1.5rem; }
    .drawer-footer {
      padding: 1rem 1.5rem; border-top: 1px solid #f1f5f9;
      display: flex; justify-content: space-between; align-items: center; gap: 0.8rem;
    }
    .drawer-footer-right { display: flex; gap: 0.6rem; }

    .navbar {
      background: white; padding: 0.8rem 2rem;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 100;
      flex-wrap: wrap; gap: 12px;
    }
    .navbar .brand {
      display: flex; align-items: center; gap: 12px; text-decoration: none;
    }
    .navbar .brand img { height: 38px; width: 38px; border-radius: 12px; object-fit: contain; }
    .navbar .brand-text { font-weight: 800; font-size: 1.2rem; color: #1e293b; }
    .navbar .brand-text span { font-weight: 600; font-size: 0.75rem; color: #7c3aed; margin-left: 5px; }
    .navbar .back-link {
      background: #f5f0ff; color: #5b21b6; padding: 0.45rem 1rem;
      border-radius: 30px; font-weight: 600; font-size: 0.8rem;
      text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
      transition: all 0.15s;
    }
    .navbar .back-link:hover { background: #7c3aed; color: white; }

    @media (max-width: 640px) {
      .container { padding: 1rem; }
      .modal-footer { flex-direction: column-reverse; }
      .modal-footer button { width: 100%; justify-content: center; }
      .drawer-footer { flex-direction: column; }
      .drawer-footer button { width: 100%; justify-content: center; }
      .drawer-footer-right { width: 100%; flex-direction: column-reverse; }
      .toast-host { left: 12px; right: 12px; bottom: 12px; }
      .toast { min-width: 0; max-width: none; }
    }
  `;
  const style = document.createElement("style");
  style.id = "prints-shared-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

// ---------------- Page shell ----------------
export function sharedNavbar() {
  return `
    <nav class="navbar">
      <a href="${DASHBOARD_URL}" class="brand">
        <img src="https://i.postimg.cc/rFfXDj3L/kazinni-removebg-preview(1).png" alt="BrandInn Prints">
        <span class="brand-text">BrandInn <span>Prints</span></span>
      </a>
      <a href="${DASHBOARD_URL}" class="back-link">
        <i class="fas fa-arrow-left"></i> Dashboard
      </a>
    </nav>
  `;
}

export function mountPageShell({ title, subtitle, icon = "fa-print", createLabel = "New", searchPlaceholder = "Search..." }) {
  injectSharedStyles();
  document.title = `${title} | BrandInn Prints`;

  if (!document.querySelector(".navbar")) {
    document.body.insertAdjacentHTML("afterbegin", sharedNavbar());
  }

  let container = document.getElementById("pageContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "pageContainer";
    container.className = "container";
    document.body.appendChild(container);
  }

  container.insertAdjacentHTML("afterbegin", `
    <div class="page-header">
      <div>
        <h1><i class="fas ${icon}"></i> ${esc(title)}</h1>
        <p>${esc(subtitle || "")}</p>
      </div>
      <button class="btn-primary" id="newBtn"><i class="fas fa-plus"></i> ${esc(createLabel)}</button>
    </div>
    <div class="toolbar">
      <input type="text" id="searchInput" placeholder="${esc(searchPlaceholder)}">
      <select id="statusFilter"><option value="">All statuses</option></select>
    </div>
    <div id="listContainer" class="loading">Loading...</div>
  `);
}
