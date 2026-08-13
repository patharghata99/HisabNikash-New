/* হিসাবনিকাশ — অফলাইন সার্ভিস ওয়ার্কার */
const VERSION = 'hn-v3';
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/vendor/xlsx.full.min.js',
  '/icon/icon-1254.png',
  '/icon/icon-512.png',
  '/icon/icon-192.png',
  '/favicon.png',
];
const RUNTIME = VERSION + '-runtime';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(CORE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.allSettled(
      keys.filter((k) => k.startsWith('hn-') && k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res && (res.status === 200 || res.type === 'opaque')) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await update) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // HTML navigations: network first, fall back to cached app shell (offline)
  if (req.mode === 'navigate') {
    event.respondWith(
      networkFirst(req, VERSION).catch(async () => {
        const c = await caches.open(VERSION);
        return (await c.match('/')) || new Response('Offline', { status: 503 });
      }),
    );
    return;
  }

  // Google Fonts + other cross-origin assets: serve from cache when offline
  if (url.origin !== self.location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
      event.respondWith(staleWhileRevalidate(req, RUNTIME));
    }
    return;
  }

  // Same-origin static assets
  event.respondWith(staleWhileRevalidate(req, VERSION));
});
