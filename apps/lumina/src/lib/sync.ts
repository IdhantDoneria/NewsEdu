// Google / Firebase Cloud Sync for Lumina
// All data defaults to localStorage-only.
// Enable cloud sync by following the steps below and calling
// configureSyncWithGoogle() from your app root.
//
// SETUP CHECKLIST
// 1. Go to https://console.firebase.google.com/ and create a project.
// 2. Project settings → Add app → Web (</>) — copy the firebaseConfig object.
// 3. Authentication → Sign-in method → enable Google.
// 4. Firestore Database → Create database (start in test mode).
// 5. npm install firebase  (inside apps/lumina)
// 6. Paste your config into a .env.local file as NEXT_PUBLIC_FIREBASE_* vars,
//    then call configureSyncWithGoogle(config) from your app root component.
//
// REQUIRED CREDENTIALS (all come from the Firebase console step above)
//   NEXT_PUBLIC_FIREBASE_API_KEY
//   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN       e.g. my-project.firebaseapp.com
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID
//   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET    e.g. my-project.appspot.com
//   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
//   NEXT_PUBLIC_FIREBASE_APP_ID

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export type SyncStatus = "unconfigured" | "syncing" | "synced" | "error";

export interface SyncState {
  status: SyncStatus;
  userEmail: string | null;
  lastSync: Date | null;
  error: string | null;
}

// ─── observable state ────────────────────────────────────────────────────────

let _state: SyncState = {
  status: "unconfigured",
  userEmail: null,
  lastSync: null,
  error: null,
};
const _listeners = new Set<(s: SyncState) => void>();

function setState(patch: Partial<SyncState>) {
  _state = { ..._state, ...patch };
  _listeners.forEach((l) => l(_state));
}

/** Subscribe to sync state changes. Returns an unsubscribe function. */
export function onSyncState(fn: (s: SyncState) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getSyncState(): SyncState {
  return _state;
}

// ─── public API (stubs until credentials are supplied) ───────────────────────

/**
 * Initialise Firebase and enable Google sign-in + Firestore sync.
 *
 * Call this once from your app root after loading the Firebase config from
 * environment variables:
 *
 *   import { configureSyncWithGoogle } from "@/lib/sync";
 *   configureSyncWithGoogle({
 *     apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
 *     authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
 *     projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
 *     storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
 *     messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
 *     appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
 *   });
 *
 * The function is safe to call unconditionally — it silently no-ops when
 * any required field is missing.
 */
export async function configureSyncWithGoogle(
  config: FirebaseConfig,
): Promise<void> {
  if (!config.apiKey || !config.projectId) {
    console.warn("[Lumina sync] Firebase config incomplete — sync disabled.");
    return;
  }

  // ── Uncomment the block below after running: npm install firebase ──────────
  //
  // import { initializeApp } from "firebase/app";
  // import {
  //   getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  // } from "firebase/auth";
  // import {
  //   getFirestore, doc, setDoc, onSnapshot, serverTimestamp,
  // } from "firebase/firestore";
  //
  // const app  = initializeApp(config);
  // const auth = getAuth(app);
  // const db   = getFirestore(app);
  //
  // onAuthStateChanged(auth, async (user) => {
  //   if (!user) {
  //     setState({ status: "unconfigured", userEmail: null });
  //     await signInWithPopup(auth, new GoogleAuthProvider());
  //     return;
  //   }
  //   setState({ status: "syncing", userEmail: user.email });
  //   const wsRef = doc(db, "lumina-workspaces", user.uid);
  //   onSnapshot(wsRef, (snap) => {
  //     if (snap.exists()) {
  //       // import { applyRemoteWorkspace } from "@/lib/store" and call it:
  //       // applyRemoteWorkspace(snap.data());
  //     }
  //     setState({ status: "synced", lastSync: new Date(), error: null });
  //   });
  // });
  // ──────────────────────────────────────────────────────────────────────────

  console.warn(
    "[Lumina sync] Firebase integration is stubbed. " +
    "Follow the instructions in src/lib/sync.ts to enable it.",
  );
}

/**
 * Push the current workspace snapshot to Firestore.
 * No-op while sync is unconfigured.
 */
export async function pushWorkspace(_workspace: unknown): Promise<void> {
  if (_state.status === "unconfigured") return;

  // ── Uncomment after configuring Firebase: ─────────────────────────────────
  // import { getAuth } from "firebase/auth";
  // import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
  //
  // const user = getAuth().currentUser;
  // if (!user) return;
  // setState({ status: "syncing" });
  // try {
  //   await setDoc(doc(getFirestore(), "lumina-workspaces", user.uid), {
  //     ..._workspace,
  //     _syncedAt: serverTimestamp(),
  //   });
  //   setState({ status: "synced", lastSync: new Date(), error: null });
  // } catch (err) {
  //   setState({ status: "error", error: String(err) });
  // }
}

/**
 * Sign the current user out of Google.
 * No-op while sync is unconfigured.
 */
export async function signOut(): Promise<void> {
  if (_state.status === "unconfigured") return;

  // ── Uncomment after configuring Firebase: ─────────────────────────────────
  // import { getAuth } from "firebase/auth";
  // await getAuth().signOut();
  setState({ status: "unconfigured", userEmail: null, lastSync: null });
}
