const CACHE_NAME = 'wedding-public-shell-v2';
const APP_PATHS = ['/guest', '/scoreboard'];
const MANIFEST_PATH = '/manifest.webmanifest';

async function cachePublicShells() {
  const cache = await caches.open(CACHE_NAME);
  const assetPaths = [];
  for (const path of APP_PATHS) {
    const response = await fetch(path, { cache: 'reload' });
    if (!response.ok) throw new Error('public_shell_unavailable');
    await cache.put(path, response.clone());
    const html = await response.text();
    assetPaths.push(...[...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((assetPath) => assetPath.startsWith('/_next/static/') || assetPath === MANIFEST_PATH));
  }
  await Promise.allSettled([...new Set(assetPaths)].map(async (path) => {
    const asset = await fetch(path, { cache: 'reload' });
    if (asset.ok) await cache.put(path, asset);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cachePublicShells().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => (name.startsWith('wedding-guest-shell-') || name.startsWith('wedding-public-shell-')) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    if (!APP_PATHS.includes(url.pathname)) return;
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(url.pathname)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname === MANIFEST_PATH) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
