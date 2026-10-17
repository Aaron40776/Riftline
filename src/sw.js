// Riftline service worker – build __RL_VERSION__ (__RL_BUILD__)
const CACHE = 'riftline-v__RL_VERSION_DASHED__-__RL_BUILD__';
const FILES = ["./","index.html","__RL_GAME_FILE__","manifest.webmanifest","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon-48.png","build-info.json","fonts/chakra-petch-latin-600-normal.woff2","fonts/chakra-petch-latin-700-normal.woff2","fonts/barlow-semi-condensed-latin-500-normal.woff2","fonts/barlow-semi-condensed-latin-600-normal.woff2","fonts/barlow-semi-condensed-latin-700-normal.woff2"];
const CORE = ['./', 'index.html', '__RL_GAME_FILE__'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => {
    const p = c.add(new Request(f, { cache: 'reload' }));
    return CORE.includes(f) ? p : p.catch(() => null);
  }))));
});
self.addEventListener('activate', (e) => {
  // 3.46.0: the old caches are kept for a 30 s grace so a bfcache-restored page of the previous
  // build can still request its subresources from them. The grace MUST NOT sit inside
  // waitUntil: a pending activate promise delays activation, and fetches queue behind it (an
  // offline reload then stalls for the whole grace). The sweep below is best-effort; whatever
  // survives it (the worker can be killed first) is swept by the next activation.
  e.waitUntil(self.clients.claim());
  setTimeout(() => {
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('riftline-') && k !== CACHE).map((k) => caches.delete(k))))
      .catch(() => {});
  }, 30000);
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // 2.8.1: network first, but a slow or hanging network (captive portal, weak signal) falls back to the
    // cached page after 3 s; the fresh page is still stored in the background for the next start
    const cached = () => caches.open(CACHE).then(c => c.match('index.html').then((hit) => hit || c.match('./')));
    const net = fetch(req, { cache: 'no-store' }).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put('index.html', copy)).catch(() => {}));
      }
      return res;
    });
    // 3.32.0: an error page of the host (a 5xx, a 404) is not the game: the cached page wins over it
    const good = net.then((res) => (res && res.ok ? res : cached().then((hit) => hit || res)));
    const slow = new Promise((resolve) => setTimeout(resolve, 3000)).then(cached).then((hit) => hit || good);
    e.respondWith(Promise.race([good, slow]).catch(() => cached()));
    e.waitUntil(net.catch(() => null));
    return;
  }
  if (url.pathname.endsWith('/build-info.json')) {
    const stored = () => caches.open(CACHE).then(c => c.match('build-info.json'));
    e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => {
      if (res && res.ok) {
        if (res.type === 'basic') {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put('build-info.json', copy)).catch(() => {}));
        }
        return res;
      }
      // 3.32.0: an error page of the host is not the build info: the stored one answers (as when offline)
      return stored().then((hit) => hit || res);
    }).catch(stored));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') c.put(req, res.clone()).catch(() => {});
    return res;
  })).catch(() => new Response('', { status: 504 }))));
});
