/*
 * Offline cache for the whole app shell.
 *
 * The app is plain static files, so the service worker simply precaches them on
 * install and serves the cache first, refreshing entries in the background.
 * Bump CACHE_VERSION whenever a shipped file changes so phones pick it up.
 */

const CACHE_VERSION = 'family-finance-v7';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/app.js',
  './js/bus.js',
  './js/components.js',
  './js/db.js',
  './js/i18n.js',
  './js/jalali.js',
  './js/report.js',
  './js/state.js',
  './js/util.js',
  './js/views/dashboard.js',
  './js/views/entry.js',
  './js/views/more.js',
  './js/views/plan.js',
  './js/views/records.js',
  './js/views/reports.js',
  './js/views/calc.js',
  './js/calcmath.js',
  './js/prefs.js',
  './js/sync.js',
  './js/assets.js',
  './js/update.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(ASSETS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

/* The app's "Reload the app" button asks the waiting worker to take over. */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_VERSION);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch (err) {
          const cache = await caches.open(CACHE_VERSION);
          const cached = (await cache.match('./index.html')) || (await cache.match('./'));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        /* Fresh files first, so a new release is never fighting a stale cache
         * entry; the cache is the offline fallback, not the first answer. */
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(request);
        return cached || Response.error();
      }
    })(),
  );
});
