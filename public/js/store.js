// Browser-only persistence. No backend, no login, no user data leaves the device —
// plans are saved in this browser's localStorage. Mirrors the old api.js shape so
// the rest of the app barely changes.
const KEY = 'fire_plans_v1';

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.plans)) return s;
  } catch { /* corrupt or empty */ }
  return { plans: [], seq: 0 };
}
function write(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
const now = () => new Date().toISOString();

export const store = {
  // returns plan metadata, most-recently-updated first
  list() {
    return read().plans
      .map(p => ({ id: p.id, name: p.name, created_at: p.created_at, updated_at: p.updated_at }))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  },
  get(id) {
    const p = read().plans.find(p => p.id === id);
    return p ? { id: p.id, name: p.name, data: p.data, created_at: p.created_at, updated_at: p.updated_at } : null;
  },
  create(name, data) {
    const s = read();
    const id = ++s.seq;
    const t = now();
    s.plans.push({ id, name, data, created_at: t, updated_at: t });
    write(s);
    return id;
  },
  update(id, name, data) {
    const s = read();
    const p = s.plans.find(p => p.id === id);
    if (!p) return false;
    p.name = name; p.data = data; p.updated_at = now();
    write(s);
    return true;
  },
  remove(id) {
    const s = read();
    s.plans = s.plans.filter(p => p.id !== id);
    write(s);
  },
};
