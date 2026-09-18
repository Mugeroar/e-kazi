/**
 * BrandInn Prints — Shared Page Module
 * ------------------------------------
 * Handles Firebase init, auth guard, real-time listener, filtering,
 * and generic create/update flows. Each page imports this and supplies
 * a config describing what node it targets and how to render each item.
 */

import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getDatabase, ref, onValue, push, set, update, remove, get
} from "firebase/database";

// ---------- Firebase config (single source of truth) ----------
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

// ---------- Shared singletons ----------
let app, auth, db;
let initialized = false;

export function initFirebase() {
  if (initialized) return { app, auth, db };
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  initialized = true;
  return { app, auth, db };
}

// ---------- Utility helpers ----------
export function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>]/g, m =>
    m === "&" ? "&amp;" : m === "<" ? "&lt;" : "&gt;"
  );
}

export function initials(name) {
  if (!name) return "?";
  const cleaned = String(name).trim().replace(/\s+/g, " ");
  if (!cleaned) return "?";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

export function statusClass(s) {
  const map = {
    active: "status-active",
    pending: "status-pending",
    planning: "status-planning",
    "in-progress": "status-in-progress",
    new: "status-new",
    printing: "status-printing",
    completed: "status-completed",
    delivered: "status-completed",
    cancelled: "status-cancelled",
    confirmed: "status-confirmed",
    low: "status-low",
    ok: "status-ok",
    quoted: "status-quoted",
    approved: "status-approved",
    processing: "status-processing",
    "on-hold": "status-pending"
  };
  return map[(s || "").toLowerCase()] || "status-pending";
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

// ---------- Auth guard ----------
export function requireAuth(onReady) {
  const { auth: a } = initFirebase();
  onAuthStateChanged(a, (user) => {
    if (!user) {
      window.location.href = LOGIN_URL;
      return;
    }
    onReady(user);
  });
}

// ---------- Listener with graceful fallback ----------
/**
 * Attaches a real-time listener to a node.
 * If the node has no rule yet (permission_denied) or doesn't exist,
 * calls onData({}) once and warns quietly to the console.
 */
export function listenNode(node, onData, onError) {
  const { db: d } = initFirebase();
  let warned = false;
  try {
    const unsub = onValue(
      ref(d, node),
      (snap) => onData(snap.val() || {}),
      (err) => {
        if (!warned) {
          warned = true;
          console.warn(`[Prints] "${node}" not readable (rules pending?):`, err?.message || err);
        }
        if (onError) onError(err);
        onData({});
      }
    );
    return unsub;
  } catch (err) {
    console.warn(`[Prints] attach failed "${node}":`, err?.message || err);
    if (onError) onError(err);
    onData({});
    return () => {};
  }
}

// ---------- CRUD helpers ----------
export async function createRecord(node, data) {
  const { db: d, auth: a } = initFirebase();
  const newRef = push(ref(d, node));
  const payload = {
    ...data,
    createdAt: Date.now(),
    createdBy: a.currentUser?.email || "",
  };
  await set(newRef, payload);
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

// ---------- Generic page controller ----------
/**
 * Bootstraps a list page.
 *
 * config = {
 *   node: 'brandinn_print_projects',
 *   containerId: 'listContainer',
 *   searchFields: ['projectName', 'businessName'],
 *   statusField: 'status',
 *   statusOptions: ['planning', 'in-progress', 'completed'],
 *   filterFn: (item, state) => boolean,        // optional override
 *   sortFn: (a, b) => number,                  // optional
 *   renderCard: (item, id, helpers) => string, // required
 *   emptyMessage: 'No projects yet',
 *   emptyIcon: 'fa-project-diagram',
 *   onCreate: async (promptFn) => data | null, // optional
 *   onCardClick: (item, id) => void,           // optional
 * }
 */
export function bootstrapListPage(config) {
  const {
    node,
    containerId,
    searchFields = [],
    statusField = "status",
    statusOptions = [],
    filterFn,
    sortFn,
    renderCard,
    emptyMessage = "Nothing here yet",
    emptyIcon = "fa-inbox",
    onCreate,
    onCardClick,
  } = config;

  const container = document.getElementById(containerId);
  const searchInput = document.getElementById("searchInput");
  const statusSelect = document.getElementById("statusFilter");
  const newBtn = document.getElementById("newBtn");

  let allItems = {};
  let unsub = null;

  // Populate status dropdown
  if (statusSelect && statusOptions.length) {
    statusOptions.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");
      statusSelect.appendChild(opt);
    });
  }

  function currentFilterState() {
    return {
      query: (searchInput?.value || "").toLowerCase().trim(),
      status: statusSelect?.value || "",
    };
  }

  function applyFilters(items) {
    const state = currentFilterState();
    let list = items;

    if (state.query && searchFields.length) {
      list = list.filter(item =>
        searchFields.some(f =>
          String(item[f] || "").toLowerCase().includes(state.query)
        )
      );
    }

    if (state.status && statusField) {
      list = list.filter(item =>
        String(item[statusField] || "").toLowerCase() === state.status.toLowerCase()
      );
    }

    if (filterFn) list = list.filter(item => filterFn(item, state));

    if (sortFn) list.sort(sortFn);
    else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return list;
  }

  function render() {
    if (!container) return;
    const items = Object.entries(allItems)
      .map(([id, v]) => ({ id, ...v }))
      .filter(v => v && typeof v === "object");
    const filtered = applyFilters(items);

    if (!filtered.length) {
      container.className = "empty-state";
      container.innerHTML = `<i class="fas ${emptyIcon}"></i> ${esc(emptyMessage)}`;
      return;
    }

    container.className = "item-grid";
    container.innerHTML = filtered.map(item => {
      const html = renderCard(item, item.id);
      return onCardClick
        ? `<div class="item-card clickable" data-id="${esc(item.id)}">${html}</div>`
        : `<div class="item-card">${html}</div>`;
    }).join("");

    if (onCardClick) {
      container.querySelectorAll(".item-card.clickable").forEach(el => {
        el.addEventListener("click", () => {
          const id = el.getAttribute("data-id");
          const item = allItems[id];
          if (item) onCardClick({ id, ...item }, id);
        });
      });
    }
  }

  // Search + filter listeners
  if (searchInput) searchInput.addEventListener("input", render);
  if (statusSelect) statusSelect.addEventListener("change", render);

  // Create button
  if (newBtn && onCreate) {
    newBtn.addEventListener("click", async () => {
      try {
        const data = await onCreate();
        if (!data) return;
        newBtn.disabled = true;
        newBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        await createRecord(node, data);
        newBtn.disabled = false;
        newBtn.innerHTML = '<i class="fas fa-plus"></i> New';
      } catch (err) {
        newBtn.disabled = false;
        newBtn.innerHTML = '<i class="fas fa-plus"></i> New';
        if ((err?.message || "").includes("permission")) {
          alert(
            `Could not save — the node "${node}" doesn't have write rules yet.\n\n` +
            `Add a rule for it in your Firebase rules to enable saving.`
          );
        } else {
          alert("Save failed: " + (err?.message || err));
        }
      }
    });
  }

  // Auth then listen
  requireAuth(() => {
    container.className = "loading";
    container.innerHTML = "Loading...";
    unsub = listenNode(node, (data) => {
      allItems = data;
      render();
    });
  });

  // Cleanup
  window.addEventListener("beforeunload", () => {
    try { unsub && unsub(); } catch (_) {}
  });

  return {
    refresh: render,
    getItems: () => allItems,
  };
}

// ---------- Reusable "prompt form" helper ----------
/**
 * Simple prompt-based form builder.
 * fields = [{ key, label, required?, placeholder?, type? }]
 * Returns object of { key: value } or null if cancelled.
 */
export function promptForm(fields) {
  const out = {};
  for (const f of fields) {
    const raw = prompt(f.label + (f.required ? " (required)" : ""), f.placeholder || "");
    if (raw === null) return null; // user cancelled
    const val = raw.trim();
    if (f.required && !val) {
      alert(`"${f.label}" is required.`);
      return null;
    }
    out[f.key] = val;
  }
  return out;
}

// ---------- Auto-inject shared CSS ----------
export function injectSharedStyles() {
  if (document.getElementById("prints-shared-styles")) return;
  const css = `
    .container { width: 100%; max-width: 1400px; margin: 0 auto; padding: 2rem; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    .page-header h1 { font-size: 1.5rem; font-weight: 800; display: flex; align-items: center; gap: 10px; }
    .page-header h1 i { color: #7c3aed; }
    .page-header p { color: #64748b; font-size: 0.85rem; margin-top: 0.3rem; }
    .primary-btn { background: #7c3aed; color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 12px; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .primary-btn:hover { background: #5b21b6; }
    .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .toolbar { background: white; border-radius: 16px; padding: 1rem 1.2rem; border: 1px solid #e2e8f0; margin-bottom: 1.5rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .toolbar input, .toolbar select { padding: 0.5rem 0.9rem; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 0.85rem; font-family: inherit; }
    .toolbar input { flex: 1; min-width: 200px; }
    .item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
    .item-card { background: white; border-radius: 16px; padding: 1.2rem; border: 1px solid #e2e8f0; transition: all 0.2s; }
    .item-card.clickable { cursor: pointer; }
    .item-card:hover { border-color: #a78bfa; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
    .item-card h3 { font-size: 1rem; font-weight: 700; margin-bottom: 0.4rem; }
    .item-card .meta { color: #64748b; font-size: 0.75rem; margin-bottom: 0.8rem; }
    .item-card .row { display: flex; justify-content: space-between; align-items: center; margin-top: 0.6rem; }
    .status-tag { padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.65rem; font-weight: 600; white-space: nowrap; }
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
    .empty-state { text-align: center; padding: 3rem 1rem; color: #94a3b8; font-size: 0.9rem; }
    .empty-state i { font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.5; }
    .loading { text-align: center; padding: 3rem; color: #94a3b8; }
  `;
  const style = document.createElement("style");
  style.id = "prints-shared-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

// ---------- Shared navbar markup helper ----------
export function sharedNavbar(activePage) {
  return `
    <nav class="navbar" style="background:white;padding:0.8rem 2rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:100;flex-wrap:wrap;gap:12px;">
      <a href="/workspaces/brandinn-print/dashboard.html" style="display:flex;align-items:center;gap:12px;text-decoration:none;">
        <img src="https://i.postimg.cc/rFfXDj3L/kazinni-removebg-preview(1).png" alt="BrandInn Prints" style="height:38px;width:38px;border-radius:12px;object-fit:contain;">
        <span style="font-weight:800;font-size:1.2rem;color:#1e293b;">BrandInn <span style="font-weight:600;font-size:0.75rem;color:#7c3aed;margin-left:5px;">Prints</span></span>
      </a>
      <a href="/workspaces/brandinn-print/dashboard.html" style="background:#f5f0ff;color:#5b21b6;padding:0.45rem 1rem;border-radius:30px;font-weight:600;font-size:0.8rem;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
        <i class="fas fa-arrow-left"></i> Dashboard
      </a>
    </nav>
  `;
}

// ---------- Page scaffolding (mounts navbar + container) ----------
export function mountPageShell({ title, subtitle, icon = "fa-print" }) {
  // Inject styles first
  injectSharedStyles();

  // Set title
  document.title = `${title} | BrandInn Prints`;

  // Find or create container
  let container = document.getElementById("pageContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "pageContainer";
    container.className = "container";
    document.body.appendChild(container);
  }

  // Insert navbar
  if (!document.querySelector(".navbar")) {
    document.body.insertAdjacentHTML("afterbegin", sharedNavbar(title));
  }

  // Insert header into container
  container.insertAdjacentHTML("afterbegin", `
    <div class="page-header">
      <div>
        <h1><i class="fas ${icon}"></i> ${title}</h1>
        <p>${subtitle || ""}</p>
      </div>
      <button class="primary-btn" id="newBtn"><i class="fas fa-plus"></i> New</button>
    </div>
    <div class="toolbar">
      <input type="text" id="searchInput" placeholder="Search...">
      <select id="statusFilter"><option value="">All statuses</option></select>
    </div>
    <div id="listContainer" class="loading">Loading...</div>
  `);
}
