/* Deliberately cache only public installation assets. No API, account pages,
   reports, uploaded files or chat data are stored in CacheStorage. */
const CACHE = "luma-public-v1";
const PUBLIC = [
  "/offline.html",
  "/icons/luma-192.png",
  "/icons/luma-512.png",
  "/icons/luma-180.png",
  "/manifest.webmanifest",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("luma-public-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (PUBLIC.includes(url.pathname))
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(event.request)) || fetch(event.request),
        ),
    );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(async (clients) => {
      const current = clients.find(
        (c) => new URL(c.url).origin === self.location.origin,
      );
      if (current) {
        await current.focus();
        current.postMessage({ type: "OPEN_NOTIFICATIONS" });
      } else await self.clients.openWindow("/");
    }),
  );
});
