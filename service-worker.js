const CACHE_NAME = "PopcornHUB-v3";

const ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon.png",
  "./favicon.ico"
];

// =========================
// INSTALL
// =========================
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {

      for (const asset of ASSETS) {
        try {
          await cache.add(asset);

          console.log(
            "SW: Cached:",
            asset
          );

        } catch (error) {

          console.warn(
            "SW: Failed to cache:",
            asset,
            error
          );

        }
      }

    })
  );

  self.skipWaiting();
});

// =========================
// ACTIVATE
// =========================
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key =>
          key !== CACHE_NAME ? caches.delete(key)
            : null
        )
      )
    )
  );

  self.clients.claim();
});

// =========================
// FETCH
// =========================
self.addEventListener("fetch", event => {
    const url = event.request.url;

    // Don't cache API calls
    if (
        url.includes("api.themoviedb.org") ||
        url.includes("anilist")
    ) {
        return;
    }

    // Don't intercept external images
    if (
        url.includes("image.tmdb.org") ||
        url.includes("via.placeholder.com")
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() =>
            caches.match(event.request)
        )
    );
});
