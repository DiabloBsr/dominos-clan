/**
 * Service worker de Domino's Clan — prudence avant tout :
 *  • les assets HACHÉS (immuables) sont servis depuis le cache dès la 2e visite ;
 *  • la navigation reste RÉSEAU D'ABORD (jamais d'app périmée), avec le
 *    dernier index en secours hors-ligne ;
 *  • socket.io et tout ce qui n'est pas de chez nous passent tout droit.
 */
const CACHE = 'dc-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/admin')) return

  // Bundles hachés par Vite : immuables → cache d'abord.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request)
        if (hit) return hit
        const res = await fetch(event.request)
        if (res.ok) cache.put(event.request, res.clone())
        return res
      }),
    )
    return
  }

  // Navigation : réseau d'abord ; hors-ligne, on ressert le dernier écran.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          caches.open(CACHE).then((cache) => cache.put('/__shell', res.clone()))
          return res
        })
        .catch(async () => (await caches.match('/__shell')) ?? Response.error()),
    )
  }
})
