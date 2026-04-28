// ── Train Log Service Worker ──
// Update this version number every time you deploy
// This is what forces the home screen app to refresh
const CACHE_VERSION = 'trainlog-v20260428104539';
const CACHE_NAME = `${CACHE_VERSION}`;

// Files to cache for offline/fast loading
const STATIC_FILES = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/firebase.js',
];

// Install — cache static files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_FILES);
    })
  );
  // Take over immediately without waiting for old SW to finish
  self.skipWaiting();
});

// Activate — delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );
  // Take control of all open pages immediately
  self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests and Firebase API calls
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firestore.googleapis.com')) return;
  if (event.request.url.includes('firebase.googleapis.com')) return;
  if (event.request.url.includes('cloudfunctions.net')) return;
  if (event.request.url.includes('googleapis.com')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache the fresh response
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — return cached version
        return caches.match(event.request);
      })
  );
});
