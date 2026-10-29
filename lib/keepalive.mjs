/**
 * Keep a background promise alive after the response has been sent, where the
 * platform offers a way to (Vercel's request context). Elsewhere it is a no-op:
 * the work still runs, it just isn't guaranteed to finish if the instance is
 * frozen.
 */
export function keepAlive(promise) {
  try {
    const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
    ctx?.waitUntil?.(promise);
  } catch {
    /* best effort */
  }
}
