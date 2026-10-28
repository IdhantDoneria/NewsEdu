/* The Meridian Brief service worker.
 *
 * - /_next/static/*: cache-first (hashed, immutable).
 * - Page navigations: network-first, falling back to the last copy of that page,
 *   then to /offline.html.
 * - GET /api/news and /api/intel*: network-first with the last response as the
 *   offline fallback, so the front page and story lists still open offline.
 * Everything else (chat, briefing POSTs, third-party requests) is left alone.
 */

const VERSION = 'v1';
const STATIC = `meridian-static-${VERSION}`;
const PAGES = `meridian-pages-${VERSION}`;
const DATA = `meridian-data-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const NAV_TIMEOUT_MS = 6000;
const MAX_ENTRIES = { [PAGES]: 30, [DATA]: 40, [STATIC]: 120 };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (!key.endsWith(VERSION)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

async function trim(name) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const extra = keys.length - (MAX_ENTRIES[name] || 50);
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (response.ok) {
      cache.put(request, response.clone()).then(() => trim(cacheName));
    }
    return response;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone()).then(() => trim(cacheName));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, PAGES, NAV_TIMEOUT_MS).catch(() => caches.match(OFFLINE_URL))
    );
  } else if (url.pathname === '/api/news' || url.pathname.startsWith('/api/intel')) {
    event.respondWith(networkFirst(request, DATA, 8000));
  }
});
