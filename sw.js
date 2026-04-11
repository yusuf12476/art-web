/* ═══════════════════════════════════════════════
   IMARA STUDIO — Service Worker
   Handles: PWA caching + Push Notifications
═══════════════════════════════════════════════ */

const CACHE_NAME = 'imara-studio-v5';
const OFFLINE_URL = '/';

// ── INSTALL ──────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([OFFLINE_URL]).catch(() => {})
    )
  );
});

// ── ACTIVATE ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — network-first, HTML never cached ─
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip cross-origin requests (CDN, Supabase, EmailJS, fonts)
  if(url.origin !== self.location.origin) return;

  // NEVER cache .html files — always fetch fresh from network
  const isHtml = url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/');
  if(isHtml) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For other assets: network-first, cache as fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if(response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match(OFFLINE_URL)))
  );
});

// ── PUSH — receive server push (Web Push API) ─
self.addEventListener('push', event => {
  let data = { title: '🎨 Imara Studio', body: 'You have a new notification.' };
  try {
    if(event.data) data = event.data.json();
  } catch(e) {
    if(event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '🎨 Imara Studio', {
      body:      data.body  || 'New notification',
      icon:      data.icon  || '/icon-192.png',
      badge:     '/icon-192.png',
      tag:       data.tag   || 'imara-notification',
      renotify:  true,
      vibrate:   [200, 100, 200],
      data:      data.data  || {},
      actions: [
        { action: 'view',    title: 'View Orders' },
        { action: 'dismiss', title: 'Dismiss'     }
      ]
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if(event.action === 'dismiss') return;

  // Open or focus the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Find existing open window
      const existing = clients.find(c => c.url && c.url.includes(self.location.origin));
      if(existing) {
        existing.focus();
        existing.postMessage({ type: 'NOTIFICATION_CLICK', data: event.notification.data });
        return;
      }
      // Open new window
      return self.clients.openWindow(self.location.origin + '/?admin=1');
    })
  );
});

// ── MESSAGE — triggered from page JS ─────────
// This allows the page to ask the SW to show a notification
// even when running in the background on Android PWA
self.addEventListener('message', event => {
  if(!event.data) return;

  if(event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, data } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || '🎨 Imara Studio', {
        body:     body || '',
        icon:     '/icon-192.png',
        badge:    '/icon-192.png',
        tag:      'imara-order',
        renotify: true,
        vibrate:  [200, 100, 200],
        data:     data || {},
        actions: [
          { action: 'view',    title: 'View Orders' },
          { action: 'dismiss', title: 'Dismiss'     }
        ]
      })
    );
  }

  if(event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
