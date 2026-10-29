/**
 * Server-side telemetry: fire-and-forget events into a capped KV list.
 * Never throws and never blocks a request.
 */
import { kvPush } from './store/kv.mjs';

export const TELEMETRY_KEY = 'telemetry:events';

/** @param {string} type  e.g. 'chat', 'feedback', 'intel', 'ingest'  @param {object} data small JSON-safe payload */
export function recordEvent(type, data = {}) {
  try {
    void kvPush(TELEMETRY_KEY, { t: Date.now(), type: String(type).slice(0, 32), ...data }, { max: 1000 }).catch(() => {});
  } catch {
    // ignore
  }
}
