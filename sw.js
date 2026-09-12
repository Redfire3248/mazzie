// ══════════════════════════════════════════════════
// MAZZIE service worker
//
// Two jobs, and deliberately nothing more:
//   1. show notifications — phones only allow them from here, never from the page
//   2. take the player straight to the game when they tap one
//
// It does NOT cache the game. Caching would fight the ?v= asset version in index.html
// and hand people stale JavaScript, which has bitten this project before.
// ══════════════════════════════════════════════════

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// The page asks the worker to show a notification (page → worker)
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'notify') return;
  const title = String(d.title || 'MAZZIE').slice(0, 80);
  self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 200),
    tag: String(d.tag || 'mazzie'),
    renotify: true,
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png',
    data: { url: d.url || './' }
  });
});

// Tapping a notification focuses the game if it is already open, else opens it
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const want = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { await c.focus(); return; } catch (err) {} }
    }
    if (self.clients.openWindow) await self.clients.openWindow(want);
  })());
});
