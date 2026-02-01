// AquaRythu Service Worker - Offline Support
const CACHE_NAME = 'aquarythu-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Use addAll with individual catch to handle partial failures
      return Promise.all(
        STATIC_ASSETS.map(url => 
          fetch(url, { cache: 'no-store' })
            .then(response => {
              if (!response.ok) {
                throw new Error(`Failed to fetch ${url}: ${response.status}`);
              }
              return cache.put(url, response);
            })
            .catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err.message);
              // Continue with other assets
            })
        )
      );
    }).catch(err => {
      console.error('[SW] Cache installation failed:', err);
    })
  );
  self.skipWaiting();
});

// Fetch event - Network first, fall back to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests and chrome-extension URLs
  if (event.request.method !== 'GET') {
    return;
  }
  
  const url = new URL(event.request.url);
  
  // Skip chrome-extension URLs and non-HTTP(S) requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache successful same-origin responses
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clonedResponse).catch(err => {
              console.warn('[SW] Failed to cache response:', err);
            });
          }).catch(err => {
            console.warn('[SW] Failed to open cache:', err);
          });
        }
        return response;
      })
      .catch(err => {
        console.warn('[SW] Network fetch failed, falling back to cache:', err);
        // Fall back to cached version
        return caches.match(event.request)
          .then(cached => {
            if (cached) {
              return cached;
            }
            // If it's a navigation request, fall back to index.html
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            // Otherwise return a simple error response
            return new Response('Network error and no cache available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          })
          .catch(err => {
            console.error('[SW] Cache match failed:', err);
            return new Response('Service Worker error', { status: 500 });
          });
      })
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName).catch(err => {
              console.warn('[SW] Failed to delete old cache:', err);
            });
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).catch(err => {
      console.error('[SW] Activation error:', err);
    })
  );
});

// Message handling for skip waiting
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
