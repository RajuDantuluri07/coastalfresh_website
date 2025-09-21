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
  // Let the browser do its default thing for non-GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle the request ourselves.
  event.respondWith(async function() {
    // Try to get the response from a cache.
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);

    if (cachedResponse) {
      // If we found a match in the cache, return it.
      return cachedResponse;
    }

    // If we didn't find a match in the cache, use the network.
    const fetchResponse = await fetch(event.request);
    // Save the new response in the cache.
    cache.put(event.request, fetchResponse.clone());
    // And return it.
    return fetchResponse;
  }());
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