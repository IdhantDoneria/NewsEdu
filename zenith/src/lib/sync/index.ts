// ─── Zenith cloud sync engine ─────────────────────────────────────────────────
// "Sign in with Google, your workspace follows you."
//
// Local-first: the in-memory store + IndexedDB stay the source of truth; the
// user's OWN Firebase project is a mirror used for backup and multi-device.
//
// Firestore layout:   users/{uid}/{pages|blocks|comments}/{docId}
// Document shape:     { updatedAt: number, data: string }   (data = entity JSON)
//
// The entity travels as a JSON string because Firestore can't store every
// shape Zenith uses (e.g. nested arrays in table-block rows), and the mirror
// never needs server-side queries beyond updatedAt. Conflict policy is
// last-writer-wins on the entity's own updatedAt.

import { kvGet, kvSet } from '../db';
import { syncDam } from '../dam';
import { storeEvents, type ChangeEvent } from '../events';
import { applyRemote, updateSettings, useStore } from '../store';
import {
  destroyFirebase, getFirebase, googleSignIn, googleSignOut, parseFirebaseConfig,
  watchAuth, type FirebaseHandle,
} from './firebase';

export { parseFirebaseConfig };

// ─── Status (contract — keep signatures) ─────────────────────────────────────

export interface SyncInfo {
  state: 'off' | 'connecting' | 'syncing' | 'synced' | 'error';
  user?: { email: string; name?: string; photo?: string };
  lastSync?: number;
  error?: string;
}

let status: SyncInfo = { state: 'off' };
const subs = new Set<(s: SyncInfo) => void>();

export function getSyncStatus(): SyncInfo {
  return status;
}

export function onSyncStatus(cb: (s: SyncInfo) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function setSyncStatus(next: SyncInfo): void {
  status = next;
  subs.forEach((cb) => {
    try { cb(next); } catch (e) { console.error('[sync] status subscriber', e); }
  });
}

// ─── Engine state ─────────────────────────────────────────────────────────────

const TABLES = ['pages', 'blocks', 'comments'] as const;
type TableName = (typeof TABLES)[number];
interface Entity { id: string; updatedAt?: number; [k: string]: any }

const FLUSH_DEBOUNCE = 800;     // ms of local quiet before pushing
const BATCH_LIMIT = 400;        // writes per Firestore batch (hard cap is 500)
const MAX_RETRIES = 3;          // flush retries before staying in 'error'
const ECHO_TTL = 20_000;        // ms a "just written by us" marker stays valid

let fb: FirebaseHandle | null = null;
let authUnsub: (() => void) | null = null;
let user: any = null;           // current Firebase auth user
let running = false;            // live engine attached (snapshots + change feed)
let starting = false;
let gen = 0;                    // generation token — bump invalidates in-flight starts

let snapUnsubs: Array<() => void> = [];
let changeUnsub: (() => void) | null = null;

/** latest local change per doc, awaiting push (doc null = delete) */
const pending = new Map<string, { table: TableName; id: string; doc: Entity | null }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let failures = 0;               // consecutive flush failures

/** doc keys we just wrote ourselves → skip their snapshot echoes (key → expiry) */
const justWritten = new Map<string, number>();

const keyOf = (table: string, id: string) => `${table}:${id}`;

function localRecords(table: TableName): Record<string, Entity> {
  return useStore.getState()[table] as Record<string, Entity>;
}

function userInfo(u: any): SyncInfo['user'] | undefined {
  if (!u) return undefined;
  return {
    email: (u.email as string) ?? '',
    name: (u.displayName as string) ?? undefined,
    photo: (u.photoURL as string) ?? undefined,
  };
}

function errMessage(e: any): string {
  if (e && typeof e.code === 'string' && e.code) {
    return e.code.replace(/^(auth|firestore|permission)\//, '').replace(/-/g, ' ');
  }
  const m = e?.message ? String(e.message) : String(e ?? 'unknown error');
  return m.replace(/^Firebase:\s*/i, '').slice(0, 160);
}

function encodeDoc(entity: Entity): { updatedAt: number; data: string } {
  return { updatedAt: entity.updatedAt ?? 0, data: JSON.stringify(entity) };
}

function decodeDoc(raw: any): Entity | null {
  if (!raw) return null;
  try {
    if (typeof raw.data === 'string') return JSON.parse(raw.data) as Entity;
    if (raw.id) return raw as Entity; // tolerate plain-object docs
  } catch { /* corrupt remote doc — ignore it */ }
  return null;
}

/** True (and consumes the marker) if we wrote this doc ourselves recently. */
function consumeEcho(key: string): boolean {
  const exp = justWritten.get(key);
  if (exp === undefined) return false;
  justWritten.delete(key);
  return exp >= Date.now();
}

function pruneEchoes(): void {
  const t = Date.now();
  for (const [k, exp] of justWritten) if (exp < t) justWritten.delete(k);
}

// ─── Boot / connection ────────────────────────────────────────────────────────

/**
 * Called once at boot (after bootStore). If the user saved a Firebase config
 * and enabled sync, connect: the SDK loads, and when the cached Google session
 * appears the engine starts. Otherwise stays 'off' and loads nothing.
 */
export function initSync(): void {
  void kvGet<number>('sync.lastSync').then((ts) => {
    if (ts && !status.lastSync) setSyncStatus({ ...status, lastSync: ts });
  });
  const { firebaseConfig, syncEnabled } = useStore.getState().settings;
  if (!firebaseConfig || !syncEnabled) return;
  void connect().catch((e) => {
    setSyncStatus({ state: 'error', error: errMessage(e), lastSync: status.lastSync });
  });
}

/** Load SDK + init app from settings, attach the auth watcher (idempotent). */
async function connect(): Promise<FirebaseHandle> {
  const cfgJson = useStore.getState().settings.firebaseConfig;
  if (!cfgJson) throw new Error('No Firebase configuration saved.');
  if (status.state === 'off') {
    setSyncStatus({ state: 'connecting', user: userInfo(user), lastSync: status.lastSync });
  }
  const h = await getFirebase(cfgJson);
  if (h !== fb || !authUnsub) {
    fb = h;
    if (authUnsub) authUnsub();
    authUnsub = watchAuth(h, (u) => { void onAuthChanged(u); });
  }
  return h;
}

async function onAuthChanged(u: any): Promise<void> {
  user = u;
  const enabled = !!useStore.getState().settings.syncEnabled;
  if (u && enabled) {
    await startEngine();
  } else {
    stopEngine();
    setSyncStatus({ state: 'off', user: userInfo(u), lastSync: status.lastSync });
  }
}

// ─── Engine lifecycle ─────────────────────────────────────────────────────────

async function startEngine(): Promise<void> {
  if (!fb || !user || running || starting) return;
  starting = true;
  const g = ++gen;
  const dead = () => g !== gen;
  setSyncStatus({ state: 'connecting', user: userInfo(user), lastSync: status.lastSync });
  try {
    await reconcile(dead);
    if (dead()) return;
    attachSnapshots();
    attachChangeFeed();
    running = true;
    failures = 0;
    const ts = Date.now();
    void kvSet('sync.lastSync', ts);
    setSyncStatus({ state: 'synced', user: userInfo(user), lastSync: ts });
  } catch (e) {
    if (!dead()) {
      setSyncStatus({ state: 'error', user: userInfo(user), error: errMessage(e), lastSync: status.lastSync });
    }
  } finally {
    starting = false;
  }
}

function stopEngine(): void {
  gen++;
  running = false;
  starting = false;
  for (const u of snapUnsubs) { try { u(); } catch { /* ignore */ } }
  snapUnsubs = [];
  if (changeUnsub) { changeUnsub(); changeUnsub = null; }
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  pending.clear();
  justWritten.clear();
  flushing = false;
  failures = 0;
}

/** Public teardown: stop listeners/queues; local data untouched. */
export function stopSync(): void {
  stopEngine();
  setSyncStatus({ state: 'off', user: userInfo(user), lastSync: status.lastSync });
}

// ─── Initial reconcile ────────────────────────────────────────────────────────
// Pull all three collections; newer-remote wins locally (applyRemote — never
// echoes), newer-or-missing-local wins remotely (batched push).

async function reconcile(dead: () => boolean): Promise<void> {
  const h = fb!;
  const uid = user.uid as string;
  const toPush: Array<{ table: TableName; id: string; doc: Entity | null }> = [];
  for (const table of TABLES) {
    const snap = await h.fsMod.getDocs(h.fsMod.collection(h.fs, 'users', uid, table));
    if (dead()) return;
    const remoteAt = new Map<string, number>();
    snap.forEach((d: any) => {
      const raw = d.data();
      remoteAt.set(d.id, typeof raw?.updatedAt === 'number' ? raw.updatedAt : 0);
      const entity = decodeDoc(raw);
      if (!entity) return;
      const local = localRecords(table)[d.id];
      if (!local || (entity.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
        applyRemote(table, d.id, entity);
      }
    });
    const locals = localRecords(table); // re-read after applyRemote
    for (const id in locals) {
      const at = remoteAt.get(id);
      if (at === undefined || (locals[id].updatedAt ?? 0) > at) {
        toPush.push({ table, id, doc: locals[id] });
      }
    }
  }
  if (dead()) return;
  if (toPush.length) await pushDocs(toPush);
}

/** Batched upsert/delete to Firestore, chunked under the 500-write cap. */
async function pushDocs(items: Array<{ table: TableName; id: string; doc: Entity | null }>): Promise<void> {
  if (!fb || !user) throw new Error('Not connected.');
  const h = fb;
  const uid = user.uid as string;
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const chunk = items.slice(i, i + BATCH_LIMIT);
    const batch = h.fsMod.writeBatch(h.fs);
    const exp = Date.now() + ECHO_TTL;
    for (const it of chunk) {
      const ref = h.fsMod.doc(h.fs, 'users', uid, it.table, it.id);
      if (it.doc === null) batch.delete(ref);
      else batch.set(ref, encodeDoc(it.doc));
      justWritten.set(keyOf(it.table, it.id), exp);
    }
    // Every write-batch passes through the sync dam: bursts of edits drain to
    // Firestore at a steady rate instead of flooding the backend (and its quota).
    await syncDam.schedule(() => batch.commit());
  }
}

// ─── Live: cloud → local ──────────────────────────────────────────────────────

function attachSnapshots(): void {
  const h = fb!;
  const uid = user.uid as string;
  for (const table of TABLES) {
    const unsub = h.fsMod.onSnapshot(
      h.fsMod.collection(h.fs, 'users', uid, table),
      (snap: any) => onRemoteSnapshot(table, snap),
      (err: any) => {
        if (running) {
          setSyncStatus({ ...status, state: 'error', error: errMessage(err) });
        }
      },
    ) as () => void;
    snapUnsubs.push(unsub);
  }
}

function onRemoteSnapshot(table: TableName, snap: any): void {
  for (const ch of snap.docChanges()) {
    const id = ch.doc.id as string;
    const key = keyOf(table, id);
    // latency-compensated event for our own un-committed write — pure echo
    if (ch.doc.metadata?.hasPendingWrites) continue;
    if (ch.type === 'removed') {
      // our own deleteDoc coming back → skip; otherwise only delete docs we
      // actually have (a local-only doc can't legitimately be removed remotely)
      if (consumeEcho(key)) continue;
      if (localRecords(table)[id]) applyRemote(table, id, null);
      continue;
    }
    const entity = decodeDoc(ch.doc.data());
    if (!entity) continue;
    const local = localRecords(table)[id];
    if (local && (entity.updatedAt ?? 0) <= (local.updatedAt ?? 0)) {
      consumeEcho(key); // our own write echoed back (equal ts) or stale — skip
      continue;
    }
    applyRemote(table, id, entity);
  }
}

// ─── Live: local → cloud ──────────────────────────────────────────────────────

function attachChangeFeed(): void {
  changeUnsub = storeEvents.on('change', (e: ChangeEvent) => {
    if (e.remote || !running) return;
    pending.set(keyOf(e.table, e.id), { table: e.table, id: e.id, doc: e.doc ?? null });
    scheduleFlush();
  });
}

function scheduleFlush(): void {
  if (failures > MAX_RETRIES) return; // exhausted — stay 'error' until "Sync now"
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, FLUSH_DEBOUNCE);
}

async function flush(): Promise<void> {
  if (!running || !fb || !user || pending.size === 0) return;
  if (flushing) { scheduleFlush(); return; }
  flushing = true;
  pruneEchoes();
  const items = Array.from(pending.values());
  pending.clear();
  setSyncStatus({ ...status, state: 'syncing' });
  try {
    await pushDocs(items);
    failures = 0;
    const ts = Date.now();
    void kvSet('sync.lastSync', ts);
    if (running) setSyncStatus({ state: 'synced', user: userInfo(user), lastSync: ts });
  } catch (e) {
    // re-queue whatever a newer local change hasn't already superseded
    for (const it of items) {
      const k = keyOf(it.table, it.id);
      if (!pending.has(k)) pending.set(k, it);
    }
    failures++;
    setSyncStatus({ ...status, state: 'error', error: errMessage(e) });
    if (failures <= MAX_RETRIES && running) {
      const delay = 1500 * 2 ** failures; // 3s, 6s, 12s
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { retryTimer = null; void flush(); }, delay);
    }
  } finally {
    flushing = false;
  }
}

// ─── Public actions ───────────────────────────────────────────────────────────

/** Google sign-in popup. The auth watcher then starts the engine if enabled. */
export async function signIn(): Promise<void> {
  const h = await connect();
  try {
    await googleSignIn(h);
  } catch (e) {
    if (!running) setSyncStatus({ state: 'off', user: userInfo(user), lastSync: status.lastSync });
    throw e;
  }
}

/** Sign out of Google; sync stops, local data stays. */
export async function signOut(): Promise<void> {
  stopEngine();
  const h = fb;
  if (h) { try { await googleSignOut(h); } catch { /* ignore */ } }
  user = null;
  setSyncStatus({ state: 'off', lastSync: status.lastSync });
}

/** Toggle sync from settings; persists the flag and starts/stops the engine. */
export async function setSyncEnabled(on: boolean): Promise<void> {
  updateSettings({ syncEnabled: on });
  if (on) {
    await connect();                 // watcher fires with the cached user, if any
    if (user) await startEngine();   // watcher already attached → start directly
  } else {
    stopSync();
  }
}

/** Validate + persist a pasted config; reconnects if it replaced an old one. */
export async function saveFirebaseConfig(raw: string): Promise<void> {
  const cfg = parseFirebaseConfig(raw);
  const json = JSON.stringify(cfg, null, 2);
  const prev = useStore.getState().settings.firebaseConfig;
  updateSettings({ firebaseConfig: json });
  if (prev && prev !== json) {
    // config replaced — tear the old app down before reconnecting
    stopEngine();
    if (authUnsub) { authUnsub(); authUnsub = null; }
    fb = null;
    user = null;
    await destroyFirebase();
    setSyncStatus({ state: 'off', lastSync: status.lastSync });
  }
  if (useStore.getState().settings.syncEnabled) await connect();
}

/** Forget the Firebase project entirely: stop sync, sign out, drop the app. */
export async function removeFirebaseConfig(): Promise<void> {
  stopEngine();
  if (authUnsub) { authUnsub(); authUnsub = null; }
  const h = fb;
  fb = null;
  user = null;
  if (h) { try { await googleSignOut(h); } catch { /* ignore */ } }
  await destroyFirebase();
  updateSettings({ firebaseConfig: undefined, syncEnabled: false });
  setSyncStatus({ state: 'off' });
}

/** "Sync now": force-push the entire local workspace (plus queued deletes). */
export async function pushAll(): Promise<void> {
  failures = 0;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (!running) {
    await connect();
    if (!user) throw new Error('Sign in with Google first.');
    await startEngine(); // reconciles + attaches live listeners
    if (!running) throw new Error(status.error ?? 'Sync could not start.');
  }
  // dedupe: queued deletes survive; every live entity gets a fresh push
  const all = new Map<string, { table: TableName; id: string; doc: Entity | null }>();
  for (const [k, v] of pending) all.set(k, v);
  pending.clear();
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  for (const table of TABLES) {
    const recs = localRecords(table);
    for (const id in recs) all.set(keyOf(table, id), { table, id, doc: recs[id] });
  }
  setSyncStatus({ ...status, state: 'syncing', user: userInfo(user) });
  try {
    await pushDocs(Array.from(all.values()));
    failures = 0;
    const ts = Date.now();
    void kvSet('sync.lastSync', ts);
    setSyncStatus({ state: 'synced', user: userInfo(user), lastSync: ts });
  } catch (e) {
    failures++;
    setSyncStatus({ ...status, state: 'error', error: errMessage(e) });
    throw e;
  }
}
