
const CACHE = "talmaza-v3";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./accounts.js",
  "./manifest.webmanifest"
];

// INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith("talmaza-") &&
              name !== CACHE
          )
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

// FETCH
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache Supabase requests.
  if (url.hostname.endsWith(".supabase.co")) {
    return;
  }

  // Website files: network first, cached fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);

          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
          }

          return response;
        } catch (error) {
          const cached = await caches.match(request);

          if (cached) return cached;

          throw error;
        }
      })()
    );

    return;
  }

  // External JavaScript libraries: cache first.
  const allowedCDNs = [
    "cdn.jsdelivr.net",
    "cdnjs.cloudflare.com",
    "unpkg.com"
  ];

  if (allowedCDNs.includes(url.hostname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        if (cached) return cached;

        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }

        return response;
      })()
    );
  }
});
