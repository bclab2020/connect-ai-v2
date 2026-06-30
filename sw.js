const CACHE_NAME = "elite-performance-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./db.js",
  "./biomechanics.js",
  "./api.js",
  "./app.js",
  "./measurement.html",
  "./portal.css",
  "./portal.js",
  "./mock_app.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap"
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching application assets...");
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network falling back to cache)
self.addEventListener("fetch", (event) => {
  // Only handle GET requests, ignore POST/PUT from API calls
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone response and update cache dynamically
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network is down
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If not in cache and network fails, return basic offline placeholder if index.html
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      })
  );
});
