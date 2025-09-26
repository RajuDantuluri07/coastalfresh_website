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

const CACHE_NAME = 'coastal-fresh-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/main.css',
  '/js/app.js',
  '/js/ui.js',
  '/js/handlers.js',
  '/products.json',
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
    url.hostname.includes('hotjar.com')
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