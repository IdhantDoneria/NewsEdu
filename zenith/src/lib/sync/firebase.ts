// ─── Firebase v10 modular SDK, loaded at runtime from the Google CDN ─────────
// Zenith ships zero Firebase bytes. When (and only when) the user pastes their
// own free Firebase web config, the SDK is fetched lazily from gstatic. All
// module shapes are `any` (see firebase-cdn.d.ts) — we use a small, stable
// slice of the v10 API: app init, Google auth, Firestore reads/writes.

export interface FirebaseMods {
  appMod: any;
  authMod: any;
  fsMod: any;
}

export interface FirebaseHandle extends FirebaseMods {
  app: any;
  auth: any;
  fs: any;
  config: Record<string, string>;
}

let modsPromise: Promise<FirebaseMods> | null = null;

/** Load the three SDK modules from the CDN (once; retried after a failure). */
export function loadFirebase(): Promise<FirebaseMods> {
  if (!modsPromise) {
    modsPromise = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(/* @vite-ignore */ 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import(/* @vite-ignore */ 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
        import(/* @vite-ignore */ 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
      ]);
      return { appMod, authMod, fsMod } as FirebaseMods;
    })();
    // allow a clean retry if the CDN fetch failed (offline, blocked, …)
    modsPromise.catch(() => { modsPromise = null; });
  }
  return modsPromise;
}

let handle: FirebaseHandle | null = null;
let handleCfg = '';

/**
 * Initialize the Firebase app from the saved config JSON. Cached; if the
 * config string changed, the previous app is torn down and a fresh one built.
 * The default app name is kept stable so auth persistence (cached Google
 * session in IndexedDB) survives reloads.
 */
export async function getFirebase(configJson: string): Promise<FirebaseHandle> {
  if (handle && handleCfg === configJson) return handle;
  const { appMod, authMod, fsMod } = await loadFirebase();
  // tear down any previous app (config was replaced)
  for (const a of appMod.getApps()) {
    try { await appMod.deleteApp(a); } catch { /* already deleted */ }
  }
  handle = null;
  handleCfg = '';
  const config = JSON.parse(configJson) as Record<string, string>;
  const app = appMod.initializeApp(config);
  const auth = authMod.getAuth(app);
  const fs = fsMod.getFirestore(app);
  handle = { appMod, authMod, fsMod, app, auth, fs, config };
  handleCfg = configJson;
  return handle;
}

/** Delete the current Firebase app (used when the config is removed). */
export async function destroyFirebase(): Promise<void> {
  const h = handle;
  handle = null;
  handleCfg = '';
  if (h) { try { await h.appMod.deleteApp(h.app); } catch { /* ignore */ } }
}

export function currentFirebase(): FirebaseHandle | null {
  return handle;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Google sign-in via popup; resolves with the Firebase user. */
export async function googleSignIn(h: FirebaseHandle): Promise<any> {
  const provider = new h.authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await h.authMod.signInWithPopup(h.auth, provider);
  return cred.user;
}

export async function googleSignOut(h: FirebaseHandle): Promise<void> {
  await h.authMod.signOut(h.auth);
}

/** Subscribe to auth state (fires immediately with the cached user, if any). */
export function watchAuth(h: FirebaseHandle, cb: (user: any) => void): () => void {
  return h.authMod.onAuthStateChanged(h.auth, cb) as () => void;
}

// ─── Config parsing ───────────────────────────────────────────────────────────

/**
 * Accepts whatever the user pastes from the Firebase console — strict JSON or
 * the JS snippet (`const firebaseConfig = { apiKey: "…", … };`) — normalizes
 * quotes/keys and returns the parsed config. Throws a friendly Error if the
 * text can't be understood or required fields are missing.
 */
export function parseFirebaseConfig(raw: string): Record<string, string> {
  let s = (raw ?? '').trim();
  if (!s) throw new Error('Paste your Firebase web config first.');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('Could not find a { … } config object in the pasted text.');
  }
  s = s
    .slice(start, end + 1)
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')        // quote bare keys
    .replace(/'([^'\\]*)'/g, (_m, v: string) => JSON.stringify(v)) // single → double quotes
    .replace(/,\s*([}\]])/g, '$1');                                // trailing commas
  let cfg: any;
  try {
    cfg = JSON.parse(s);
  } catch {
    throw new Error("That doesn't parse as a config object — paste the exact snippet from the Firebase console.");
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new Error('Expected a config object like { apiKey: "…", projectId: "…", … }.');
  }
  for (const k of ['apiKey', 'authDomain', 'projectId', 'appId']) {
    if (!cfg[k] || typeof cfg[k] !== 'string') {
      throw new Error(`Config is missing "${k}" — copy the full object from Project settings → Your apps.`);
    }
  }
  return cfg as Record<string, string>;
}
