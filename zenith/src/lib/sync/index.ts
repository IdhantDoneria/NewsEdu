// STUB — replaced by the Sync agent.
// Contract:
//   initSync(): called once at boot after bootStore(); starts cloud sync when configured.
//   getSyncStatus(): SyncInfo; onSyncStatus(cb): unsubscribe
export interface SyncInfo {
  state: 'off' | 'connecting' | 'syncing' | 'synced' | 'error';
  user?: { email: string; name?: string; photo?: string };
  lastSync?: number;
  error?: string;
}

let status: SyncInfo = { state: 'off' };
const subs = new Set<(s: SyncInfo) => void>();

export function initSync(): void {
  // no-op until the sync module lands
}

export function getSyncStatus(): SyncInfo {
  return status;
}

export function onSyncStatus(cb: (s: SyncInfo) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function setSyncStatus(next: SyncInfo): void {
  status = next;
  subs.forEach((cb) => cb(next));
}
