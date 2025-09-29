// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');
// NEW: Import the shared Firebase configuration
importScripts('/js/firebase-config.js');

// Initialize the Firebase app in the service worker by passing in the messagingSenderId.
firebase.initializeApp(self.firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  console.log("[service-worker.js] Received background message ", payload);

  // More robustly get title and options from either notification or data payload
  const notificationTitle = payload.notification?.title || payload.data?.title || "New Message from Coastal Fresh";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "You have a new message.",
    icon: payload.notification?.icon || payload.data?.icon || "https://res.cloudinary.com/dpyniai9l/image/upload/v1755523336/Coastal_Fresh_Logo_2_u4xdfa.png",
    // NEW: Add a badge for a better native experience on Android
    badge: "https://res.cloudinary.com/dpyniai9l/image/upload/v1755523336/Coastal_Fresh_Logo_2_u4xdfa.png",
    // Add data to the notification to handle clicks
    data: {
      url: payload.data?.url || payload.notification?.click_action || '/' // Default to homepage if no URL is provided
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks to open the correct URL
self.addEventListener('notificationclick', event => {
  event.notification.close(); // Close the notification

  // FIX: Safely construct the URL, falling back to the homepage if data is missing.
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clientList => {
      // If a window for the app is already open and visible, focus it.
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window.
      return clients.openWindow(urlToOpen);
    })
  );
});

const CACHE_NAME = 'coastal-fresh-v3'; // Increment CACHE_NAME to force a new service worker installation
const urlsToCache = [
  '/',
  '/index.html',
  '/main.css',
  // Admin files should generally not be cached by the service worker
  // or should use a network-only strategy to ensure freshness.
  // They are not explicitly listed here, which is good, but we need
  // to ensure they are not caught by the generic "Cache first" strategy.
  // We will add a specific bypass for them in the fetch event.
  // If admin.html/css/js were ever added here, they should be removed.
  // For now, they are not here, which is good.

  '/js/app.js',
  '/js/ui.js',
  '/js/handlers.js',
  '/favicon.ico',
  // NEW: Cloudinary images will now be cached dynamically, so we remove the single logo from precache.
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
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
      .then(() => self.skipWaiting()) // NEW: Force the new service worker to activate immediately
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
      ).then(() => self.clients.claim()); // NEW: Take control of all open clients
    }) 
  );
});

// --- NEW: Refactored Fetch Event Listener ---

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass for admin pages and Firebase auth
  if (url.pathname.startsWith('/admin') || url.hostname.includes('firebase')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Stale-while-revalidate for fonts and external CSS
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // NEW: Cache-first strategy for Cloudinary images
  if (url.hostname === 'res.cloudinary.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for all other local assets (JS, CSS, etc.)
  event.respondWith(cacheFirst(request));
});

// --- NEW: Caching Strategy Functions ---

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    // Only cache successful responses
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Fetch failed; returning offline page instead.', error);
    // Optional: return a fallback offline image/page
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.log('Network request failed, falling back to cache for:', request.url);
    const cachedResponse = await caches.match(request);
    return cachedResponse || caches.match('/index.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then(async (networkResponse) => {
    await cache.put(request, networkResponse.clone());
return networkResponse;
  });

  return cachedResponse || fetchPromise;
}

function networkOnly(request) {
  return fetch(request);
}