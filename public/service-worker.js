const CACHE_NAME = 'coastal-fresh-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/main.css',
  '/main.js',
  '/products.json',
  '/onesignal-setup.js',
  '/favicon.ico',
  'https://res.cloudinary.com/dpyniai9l/image/upload/v1755523336/Coastal_Fresh_Logo_2_u4xdfa.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap'
];

// Install a service worker
self.addEventListener('install', event => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Cache and return requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignore non-GET requests and requests to third-party services that shouldn't be cached.
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('hotjar.com') ||
    url.hostname.includes('onesignal.com')
  ) {
    // Let the browser handle these requests without interception.
    return;
  }

  // For all other GET requests, use a "Cache first, then Network" strategy.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);

      if (cachedResponse) {
        return cachedResponse;
      }

      // Not in cache, fetch from network.
      const networkResponse = await fetch(event.request);

      // IMPORTANT: Check for a valid response before caching to avoid caching errors.
      if (networkResponse && networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        cache.put(event.request, responseToCache);
      }

      return networkResponse;
    })()
  );
});

// Update a service worker and clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});