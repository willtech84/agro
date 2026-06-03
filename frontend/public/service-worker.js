const CACHE_NAME = "agro-gerenciamento-v9";
const APP_SHELL = [
  "/",
  "/index.html",
  "/config.js",
  "/app.js?v=20260530b",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-192.png",
  "/icons/icon-256.png",
  "/icons/agro.ico",
  "/icons/icon-512.svg",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (requestUrl.pathname === "/config.js") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }

          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          }

          return networkResponse;
        })
        .catch(() => caches.match("/index.html"))
    );

    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (event.request.method === "GET" && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }

        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
