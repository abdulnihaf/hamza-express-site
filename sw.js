// Hamza Express — Service Worker for Web Push Notifications
// No fetch interception — dashboards must always show live data

self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const options = {
      body: data.body || '',
      icon: '/assets/brand/he-icon.png',
      badge: '/assets/brand/he-icon.png',
      vibrate: data.vibrate || [300, 100, 300],
      tag: data.tag || 'he-ops',
      renotify: true,
      requireInteraction: true,
      data: { url: data.url || '/ops/' }
    };
    event.waitUntil(self.registration.showNotification(data.title || 'Hamza Express', options));
  } catch (e) {
    // Fallback for non-JSON payloads
    event.waitUntil(self.registration.showNotification('Hamza Express', {
      body: event.data.text(),
      icon: '/assets/brand/he-icon.png',
      vibrate: [300, 100, 300],
      tag: 'he-ops',
      renotify: true,
      requireInteraction: true,
      data: { url: '/ops/' }
    }));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/ops/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing ops tab if found
      for (const client of windowClients) {
        if (client.url.includes('/ops/') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new tab
      return clients.openWindow(url);
    })
  );
});
