const APP_CACHE = "nelayan-pintar-v8-8";
const MAP_CACHE = "nelayan-pintar-map-v8-8";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(async cache => {
      for (const url of APP_SHELL) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn("App shell tidak dapat dicache:", url);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== MAP_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Peta OpenStreetMap:
  // cache-first. Jika tile sudah pernah disimpan, gunakan saat offline.
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(
      caches.open(MAP_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          if (response.ok) {
            await cache.put(event.request, response.clone());
          }
          return response;
        } catch (e) {
          return new Response("", {
            status: 503,
            statusText: "Map tile unavailable offline"
          });
        }
      })
    );
    return;
  }

  // Firebase, cuaca, Google Maps:
  // harus online; jangan mengganggu aplikasi offline.
  if (
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("google.com")
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response("", {status:503, statusText:"Offline"})
      )
    );
    return;
  }

  // Aplikasi: cache-first, lalu network.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(APP_CACHE).then(cache => {
            cache.put(event.request, copy);
          });
        }
        return response;
      }).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("", {status:503, statusText:"Offline"});
      });
    })
  );
});
