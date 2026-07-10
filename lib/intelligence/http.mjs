/**
 * Bounded JSON body reading for POST route handlers.
 *
 * `request.json()` buffers and parses the entire body before any of the
 * routes' array caps apply, so an oversized payload could exhaust memory.
 * This helper rejects on Content-Length when the client declares it, and
 * otherwise caps the buffered text before parsing.
 */

const DEFAULT_MAX_BYTES = 64 * 1024;

/**
 * Returns { body } on success, or { error, status } the route should relay.
 * A missing/empty body resolves to `{ body: {} }` so endpoints with a valid
 * empty-profile state keep working.
 */
export async function readJsonBounded(request, maxBytes = DEFAULT_MAX_BYTES) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { error: 'payload-too-large', status: 413 };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { error: 'bad-request', status: 400 };
  }
  if (text.length > maxBytes) {
    return { error: 'payload-too-large', status: 413 };
  }
  if (!text.trim()) return { body: {} };

  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: 'bad-request', status: 400 };
  }
}
