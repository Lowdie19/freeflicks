const CACHE_NAME = "PopcornHUB-v4";

const ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon.png",
  "./favicon.ico"
];

// INSTALL
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of ASSETS) {
        try {
          await cache.add(asset);
          console.log("SW: Cached:", asset);
        } catch (error) {
          console.warn("SW: Failed to cache:", asset, error);
        }
      }
    })
  );

  self.skipWaiting();
});

// ACTIVATE
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      )
    )
  );

  self.clients.claim();
});

// FETCH
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = request.url;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  // Never cache API requests
  if (
    url.includes("api.themoviedb.org") ||
    url.includes("anilist")
  ) {
    return;
  }

  // Never cache external images
  if (
    url.includes("image.tmdb.org") ||
    url.includes("via.placeholder.com")
  ) {
    return;
  }

  // Never cache external video/player servers
  if (
    url.includes("player.videasy.to") ||
    url.includes("vidlink.pro")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        return response;
      })
      .catch(() => {
        return caches.match(request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // Always return a valid Response.
          return new Response("Offline - PopcornHUB resource unavailable.", {
            status: 503,
            statusText: "Service Unavailable",
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          });
        });
      })
  );
});
