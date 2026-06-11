// Plan persistence with two interchangeable backends behind ONE synchronous API.
//
//  • localBackend  — browser localStorage (the original guest-mode store). No login,
//                    no network, data never leaves the device.
//  • cloudBackend  — Firestore-backed, but still synchronous to callers via an
//                    in-memory Map cache that an onSnapshot listener keeps fresh.
//
// The rest of the app calls store.list/get/create/update/remove synchronously and
// is agnostic to which backend is active. Switch with setBackend().
import { db, fb } from './auth.js?v=DEV';

const KEY = 'fire_plans_v1';
const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// LOCAL BACKEND (localStorage) — original guest-mode store
// ---------------------------------------------------------------------------
function lsRead() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.plans)) return s;
  } catch { /* corrupt or empty */ }
  return { plans: [], seq: 0 };
}
function lsWrite(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

const localBackend = {
  // ids coerced to strings so they compare cleanly against UI values (3 === "3")
  list() {
    return lsRead().plans
      .map(p => ({ id: String(p.id), name: p.name, created_at: p.created_at, updated_at: p.updated_at }))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  },
  get(id) {
    const p = lsRead().plans.find(p => String(p.id) === String(id));
    return p ? { id: String(p.id), name: p.name, data: p.data, created_at: p.created_at, updated_at: p.updated_at } : null;
  },
  create(name, data) {
    const s = lsRead();
    const id = ++s.seq;
    const t = now();
    s.plans.push({ id, name, data, created_at: t, updated_at: t });
    lsWrite(s);
    return String(id);
  },
  update(id, name, data) {
    const s = lsRead();
    const p = s.plans.find(p => String(p.id) === String(id));
    if (!p) return false;
    p.name = name; p.data = data; p.updated_at = now();
    lsWrite(s);
    return true;
  },
  remove(id) {
    const s = lsRead();
    s.plans = s.plans.filter(p => String(p.id) !== String(id));
    lsWrite(s);
  },
  subscribe() { return () => {}; },   // localStorage has no live updates
  whenReady() { return Promise.resolve(); },
};

// ---------------------------------------------------------------------------
// CLOUD BACKEND (Firestore) — synchronous-to-callers via a Map cache
// ---------------------------------------------------------------------------
// Firestore rejects any `undefined` value in a document. Round-tripping through
// JSON yields a pure data tree (undefined-valued keys are dropped, functions
// removed) so a plan always writes cleanly and restores identically on next login.
function sanitize(data) {
  try { return JSON.parse(JSON.stringify(data)); }
  catch { return data; }
}

function makeCloudBackend(uid) {
  const cache = new Map();   // docId -> { id, name, data, created_at, updated_at }
  let unsub = null;
  let readyResolve;
  let readied = false;
  const readyPromise = new Promise(r => { readyResolve = r; });
  const col = () => fb.collection(db, 'users', uid, 'plans');

  function start() {
    unsub = fb.onSnapshot(col(), (snap) => {
      cache.clear();
      snap.forEach(d => cache.set(d.id, { id: d.id, ...d.data() }));
      if (!readied) { readied = true; readyResolve(); }
      _notify();
    }, (err) => {
      console.warn('[store] Firestore snapshot error', err);
      if (!readied) { readied = true; readyResolve(); }
    });
  }
  start();

  return {
    list() {
      return [...cache.values()]
        .map(p => ({ id: p.id, name: p.name, created_at: p.created_at, updated_at: p.updated_at }))
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    },
    get(id) {
      const p = cache.get(String(id));
      return p ? { id: p.id, name: p.name, data: p.data, created_at: p.created_at, updated_at: p.updated_at } : null;
    },
    create(name, data) {
      const ref = fb.doc(col());          // client-side id generation
      const id = ref.id;
      const t = now();                    // client ISO timestamp (keeps create sync + sort stable)
      const rec = { id, name, data, created_at: t, updated_at: t };
      cache.set(id, rec);                 // optimistic — snapshot echo is deduped by id
      fb.setDoc(ref, { name, data: sanitize(data), created_at: t, updated_at: t })
        .catch(err => console.warn('[store] create failed', err));
      return id;
    },
    update(id, name, data) {
      const prev = cache.get(String(id));
      const t = now();
      const created_at = prev ? prev.created_at : t;
      const rec = { id: String(id), name, data, created_at, updated_at: t };
      cache.set(String(id), rec);
      fb.setDoc(fb.doc(col(), String(id)), { name, data: sanitize(data), created_at, updated_at: t })
        .catch(err => console.warn('[store] update failed', err));
      return true;
    },
    remove(id) {
      cache.delete(String(id));
      fb.deleteDoc(fb.doc(col(), String(id)))
        .catch(err => console.warn('[store] remove failed', err));
    },
    subscribe() { return () => { if (unsub) unsub(); cache.clear(); }; },
    whenReady() { return readyPromise; },
    _teardown() { if (unsub) unsub(); cache.clear(); },
  };
}

// ---------------------------------------------------------------------------
// FACADE — active backend + change registry
// ---------------------------------------------------------------------------
let active = localBackend;
const listeners = new Set();
function _notify() { for (const cb of listeners) { try { cb(); } catch (e) { console.error(e); } } }

export const store = {
  list() { return active.list(); },
  get(id) { return active.get(id); },
  create(name, data) { return active.create(name, data); },
  update(id, name, data) { return active.update(id, name, data); },
  remove(id) { return active.remove(id); },

  // Swap the active backend. 'cloud' requires an authenticated uid.
  setBackend(kind, { uid } = {}) {
    if (active && active._teardown) active._teardown();
    active = (kind === 'cloud' && uid && db) ? makeCloudBackend(uid) : localBackend;
  },

  // Re-render hook: fires when cloud snapshots arrive. List-only on the app side.
  onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },

  // Resolves once the active backend's first data is available (immediate for local).
  whenReady() { return active.whenReady(); },
};
