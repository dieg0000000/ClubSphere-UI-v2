self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'ClubSphère';
  event.waitUntil(resolveBadge(data.badge).then((badge) => {
    const options = {
      body: data.body || '',
      icon: data.icon || '/pwa-club-icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' }
    };
    if (badge) options.badge = badge;
    return self.registration.showNotification(title, options);
  }));
});

async function resolveBadge(payloadBadge) {
  if (payloadBadge) return payloadBadge;
  try {
    const res = await fetch('/manifest-club.webmanifest');
    if (!res.ok) return undefined;
    const manifest = await res.json();
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const mono = icons.find((i) => typeof i.purpose === 'string' && i.purpose.split(' ').includes('monochrome'));
    return mono && mono.src ? new URL(mono.src, self.location.origin).href : undefined;
  } catch (e) {
    return undefined;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
