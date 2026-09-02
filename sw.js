const CACHE = 'drillboard-v4';
const ASSETS = ['./', './index.html', './styles.css', './manifest.webmanifest', './assets/icon.svg', './src/app.js', './src/data.js', './src/engine.js', './src/paging.js', './src/state.js', './src/webmcp.js'];
const scopePath = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => event.waitUntil(
  caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
));

self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
));

function isIndexRequest(url) {
  return url.pathname === scopePath || url.pathname === `${scopePath}index.html`;
}

// Application code must never be served stale next to a fresh index.html, so it is network-first.
function isCodeAsset(url) {
  return (url.pathname.startsWith(`${scopePath}src/`) && url.pathname.endsWith('.js')) || url.pathname === `${scopePath}styles.css`;
}

// The body can be consumed only once; clone synchronously before any await.
function store(key, response) {
  const copy = response.clone();
  return caches.open(CACHE).then((cache) => cache.put(key, copy));
}

function networkFirst(request, cacheKey = request) {
  return fetch(request).then((response) => {
    if (response.ok) store(cacheKey, response);
    return response;
  }).catch(() => caches.match(cacheKey).then((cached) => cached || Response.error()));
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const fresh = fetch(request).then((response) => {
      if (response.ok) store(request, response);
      return response;
    }).catch(() => cached || Response.error());
    return cached || fresh;
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(isIndexRequest(url) ? networkFirst(event.request, './index.html') : fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(isCodeAsset(url) ? networkFirst(event.request) : staleWhileRevalidate(event.request));
});
