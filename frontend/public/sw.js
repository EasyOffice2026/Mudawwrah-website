// Deliberately does nothing to any request: no caching, no offline copy, so it can never serve a stale page or hide a
// new release. Browsers only offer to install a site as an app once it has a service worker that handles requests,
// and this is that, and no more.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
