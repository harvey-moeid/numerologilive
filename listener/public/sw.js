// Naikkan versi ini kalau daftar SHELL berubah.
const CACHE_NAME = 'jn-overlay-v2';
const SHELL = ['./overlay.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: deploy baru langsung terlihat; cache hanya jadi cadangan saat offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!SHELL.some((p) => url.pathname.endsWith(p.replace('./', '/')))) return;

  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        // clone SINKRON sebelum body dipakai halaman
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(req).then((cached) => cached || Response.error())
    )
  );
});
