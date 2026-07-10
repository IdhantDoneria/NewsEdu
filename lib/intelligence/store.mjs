/**
 * Persistence for generated intelligence objects.
 *
 * Reality of the deployment target (Vercel serverless / local `next dev`):
 * there is no database. So the store is an in-memory map (per instance,
 * shared across requests and HMR via globalThis) with best-effort JSON file
 * persistence under .data/ for local durability. On a read-only filesystem
 * the file layer silently disables itself — the map alone is still correct,
 * and cluster IDs are deterministic so cold starts recompute cleanly.
 *
 * The store also retains the previous version of each intelligence object,
 * which is what powers material-change detection ("What Changed").
 */

import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), '.data', 'intel-store.json');
const MAX_ENTRIES = 400;

const g = globalThis;
if (!g.__meridianIntelStore) {
  g.__meridianIntelStore = { map: new Map(), loaded: false, fsOk: true };
}
const state = g.__meridianIntelStore;

function loadFromDisk() {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const obj = JSON.parse(raw);
    for (const [k, v] of Object.entries(obj)) state.map.set(k, v);
  } catch {
    // Missing file or unreadable FS — fine, start empty.
  }
}

let saveTimer = null;
function scheduleSave() {
  if (!state.fsOk || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(state.map)));
    } catch {
      state.fsOk = false; // read-only FS (serverless) — stay in-memory only
    }
  }, 500);
  // Don't hold the process open just for a pending cache flush.
  if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

function evictIfNeeded() {
  if (state.map.size <= MAX_ENTRIES) return;
  const entries = [...state.map.entries()].sort(
    (a, b) => (a[1].savedAt || 0) - (b[1].savedAt || 0)
  );
  for (let i = 0; i < entries.length - MAX_ENTRIES; i++) {
    state.map.delete(entries[i][0]);
  }
}

export function getStored(key) {
  loadFromDisk();
  return state.map.get(key) || null;
}

export function putStored(key, value) {
  loadFromDisk();
  state.map.set(key, { ...value, savedAt: Date.now() });
  evictIfNeeded();
  scheduleSave();
}
