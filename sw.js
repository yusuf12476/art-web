/* ═══════════════════════════════════════════════
   IMARA STUDIO — Service Worker
   Handles caching, offline support & updates
═══════════════════════════════════════════════ */

const CACHE_NAME    = 'imara-studio-v1';
const RUNTIME_CACHE = 'imara-runtime-v1';

/* Assets to cache on install */
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Unbounded:wght@300;400;700;900&display=swap',
];

/* ── Install: pre-cache core assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', event => {
  const keep = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !keep.includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first for assets, network-first for API ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and Supabase API calls (always need fresh data)
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;

  // Network-first for HTML pages (ensures latest content)
  if (event.request.destination === 'document') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for fonts, images, scripts, styles
  event.respondWith(cacheFirst(event.request));
});

/* Strategy: cache-first, fall back to network, then cache result */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a fallback if we have nothing
    return new Response('Offline — please reconnect.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/* Strategy: network-first, fall back to cache */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('<h1>You are offline</h1><p>Please reconnect to browse Imara Studio.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

/* ── Listen for skip-waiting message from app ── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
