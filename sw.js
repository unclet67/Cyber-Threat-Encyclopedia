// Offline cache for the installed (home-screen) app. Everything from this site is network-first, so a push
// to main shows up on the next online launch and the page never mixes old and new files; the last copy is
// served offline. /api/* is never cached. Only Google Fonts are served from cache first.
const CACHE = 'cte-v1';
const CORE = ['./', 'data/bundle.json', 'data/enrichment/galaxy.json', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => {
  if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
  return res;
};

const networkFirst = (req, key = req) => fetch(req).then(res => put(key, res)).catch(() => caches.match(key, { ignoreSearch: true }).then(r => r || Promise.reject(new Error('offline'))));

const staleWhileRevalidate = req => caches.match(req).then(hit => {
  const net = fetch(req).then(res => put(req, res));
  if (hit) { net.catch(() => {}); return hit; }
  return net;
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const local = url.origin === location.origin;
  // Offline, answer API reads with 404 so the page falls back to its read-only bundle.json, as it does on Pages.
  if (local && url.pathname.includes('/api/')) return e.respondWith(fetch(req).catch(() => new Response('', { status: 404 })));
  if (req.mode === 'navigate') e.respondWith(networkFirst(req, new URL('./', location).href));
  else if (local) e.respondWith(networkFirst(req));
  else if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(staleWhileRevalidate(req));
});
