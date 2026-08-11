/* ATCS TV — Service Worker
   - Halaman: network-first (fallback cache → beranda)
   - Aset statis (css/js/thumb/gambar): stale-while-revalidate
   - JANGAN cache /stream/* (HLS live — harus selalu fresh)
*/
const VERSION = 'atcs-tv-v1';
const CORE = ['/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Stream HLS live: biarkan langsung ke jaringan (proxy dev / server asli)
  if (url.pathname.startsWith('/stream/')) return;

  // Navigasi (halaman): network-first, fallback ke cache/'/'
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Aset statis: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
