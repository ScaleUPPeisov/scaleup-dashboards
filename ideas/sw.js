self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Ideas', body: 'Посмотреть свежую подборку' };
  try { data = { ...data, ...(event.data ? event.data.json() : {}) }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Ideas', {
    body: data.body || 'Посмотреть свежую подборку',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: 'ideas-fresh-selection',
    renotify: true,
    silent: false,
    data: { url: self.registration.scope },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if (client.url.startsWith(scope) && 'focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(scope);
  })());
});