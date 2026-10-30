'use client';

/**
 * Fire-and-forget reader feedback. Sent only on an explicit thumbs click, and
 * only the rating, provider and (for thumbs-down) a 200-char excerpt of the
 * question. Never throws and never blocks the UI.
 */

const ENDPOINT = '/api/telemetry';
const MAX = 200;

/**
 * @param {{ rating: 'up'|'down', provider?: string, question?: string }} payload
 * @returns {boolean} true when a request was handed to the browser
 */
export function sendFeedback(payload) {
  try {
    if (!payload || (payload.rating !== 'up' && payload.rating !== 'down')) return false;
    const body = { type: 'feedback', rating: payload.rating };
    if (typeof payload.provider === 'string') body.provider = payload.provider.slice(0, 32);
    if (payload.rating === 'down' && typeof payload.question === 'string') {
      body.question = payload.question.slice(0, MAX);
    }
    const json = JSON.stringify(body);

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        if (navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }))) return true;
      } catch {
        /* fall through to fetch */
      }
    }
    if (typeof fetch === 'function') {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        keepalive: true,
      }).catch(() => {});
      return true;
    }
  } catch {
    /* telemetry must never break the page */
  }
  return false;
}
