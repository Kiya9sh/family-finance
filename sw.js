/*
 * Offline cache for the whole app shell.
 *
 * Files are fetched from the network first and the cache is the offline
 * fallback, so a phone can never keep serving an older release's scripts
 * alongside a newer page. Bump CACHE_VERSION whenever a shipped file changes.
 */

const CACHE_VERSION = 'family-finance-r5';

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
        /* Fresh files first, so an older cached copy can never fight a new
         * release; the cache is only the offline fallback. */
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
