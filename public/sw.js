/* Only immutable static resources. Never persist HTML pages, API, tiles or user data. */
const CACHE = "halloween-static-V0.5";
const FALLBACK = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          FALLBACK,
          "/favicon.svg",
          "/pwa/icon-192.png",
          "/pwa/icon-512.png",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("halloween-static-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(FALLBACK)));
    return;
  }
  const staticAsset =
    url.pathname.startsWith("/_next/static/") ||
    /^\/pwa\/[a-z0-9-]+\.png$/.test(url.pathname) ||
    url.pathname === "/favicon.svg" ||
    url.pathname === FALLBACK;
  if (!staticAsset) return;
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(request, copy)),
            );
          }
          return response;
        }),
    ),
  );
});
