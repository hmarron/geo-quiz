const CACHE = 'geo-quiz-v1';

const GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

const CDN_URLS = [
    'https://d3js.org/d3.v7.min.js',
    'https://cdn.tailwindcss.com',
];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    self.clients.claim();
    // Remove any old caches from previous versions
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;

    // GeoJSON: cache-first — large static file, only download once
    if (request.url === GEOJSON_URL) {
        event.respondWith(
            caches.open(CACHE).then(cache =>
                cache.match(request).then(hit =>
                    hit ?? fetch(request).then(res => {
                        cache.put(request, res.clone());
                        return res;
                    })
                )
            )
        );
        return;
    }

    // CDN libs: cache-first — versioned, won't change
    if (CDN_URLS.some(u => request.url.startsWith(u))) {
        event.respondWith(
            caches.match(request).then(hit =>
                hit ?? fetch(request).then(res => {
                    caches.open(CACHE).then(c => c.put(request, res.clone()));
                    return res;
                })
            )
        );
        return;
    }

    // App shell (HTML/CSS/JS): network-first so deploys take effect,
    // fall back to cache when offline
    event.respondWith(
        fetch(request)
            .then(res => {
                if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()));
                return res;
            })
            .catch(() => caches.match(request))
    );
});