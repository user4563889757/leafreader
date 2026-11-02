/* Leafreader service worker — offline reading without a server. */
// Bump VERSION whenever the shell files change so clients drop old caches.
const VERSION = "leafreader-v4";
const SHELL = [
  "./",
  "./index.html",
  "./read.html",
  "./assets/style.css",
  "./assets/theme-init.js",
  "./assets/app.js",
  "./assets/reader.js",
  "./assets/store.js",
  "./assets/icon.svg",
  "./data/catalog.json",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isContent = url.pathname.includes("/data/books/") || url.pathname.endsWith("/data/catalog.json");

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(request);
          if (exact) return exact;
          const fallback = url.pathname.endsWith("/read.html") ? "./read.html" : "./index.html";
          return (await caches.match(fallback)) || Response.error();
        }),
    );
    return;
  }

  if (isContent) {
    // Fresh chapters when online, cached chapters when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))),
    );
    return;
  }

  // App shell: serve from cache instantly, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
