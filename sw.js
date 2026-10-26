// ===== Lull service worker =====
// Bump CACHE (and the ?v= numbers in index.html) whenever a shell file changes,
// or phones keep serving the old app.
const CACHE = 'lull-v25';
const SHELL = [
  './', './index.html',
  './css/style.css?v=25',
  './js/app.js?v=25', './js/store.js?v=25', './js/predict.js?v=25', './js/science.js?v=25',
  './js/stats.js?v=25', './js/util.js?v=25', './js/charts.js?v=25', './js/sheets.js?v=25',
  './js/sounds.js?v=25', './js/notify.js?v=25', './js/growth.js?v=25', './js/who.js?v=25',
  './js/vault.js?v=25', './js/cloud.js?v=25', './js/days.js?v=25',
  './js/monitor.js?v=25', './js/mon-store.js?v=25', './js/mon-signal.js?v=25', './js/mon-peer.js?v=25',
  './js/mon-meter.js?v=25', './js/mon-alarm.js?v=25', './js/mon-battery.js?v=25',
  './manifest.json?v=25',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // cache: 'reload' forces a trip to the network: without it the browser's own
  // HTTP cache can hand the worker the *old* file and a version bump does nothing.
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;        // never cache the visit counter
  e.respondWith(
    caches.match(e.request, { ignoreSearch: false }).then(hit => hit || fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match('./index.html')))
  );
});

// Tapping a nap reminder should bring the app forward, not open a second copy.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow('./');
  }));
});
