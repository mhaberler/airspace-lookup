import { clientsClaim, skipWaiting } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import type { WorkboxPlugin } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any }

// Take control of all clients immediately on activation, without waiting for
// a page reload. Without this, the SW only intercepts fetches after the next reload.
skipWaiting()
clientsClaim()

// Precache app shell assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST)

// Strip apiKey from cache key so it doesn't appear in Cache Storage
// and cached entries survive key rotation
const stripApiKey: WorkboxPlugin = {
    cacheKeyWillBeUsed: async ({ request }) => {
        const url = new URL(request.url)
        url.searchParams.delete('apiKey')
        return url.toString()
    },
}

// Airspace point queries: api.core.openaip.net/api/airspaces
// Triggered on map click, 10m radius. Many unique pos values → large entry limit.
registerRoute(
    ({ url }) =>
        url.hostname === 'api.core.openaip.net' && url.pathname.startsWith('/api/airspaces'),
    new StaleWhileRevalidate({
        cacheName: 'openaip-airspaces',
        plugins: [
            stripApiKey,
            new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 }),
        ],
    }),
)

// Airport area queries: api.core.openaip.net/api/airports
// Triggered on map move, 300km radius. Larger payloads, fewer unique centroids.
registerRoute(
    ({ url }) =>
        url.hostname === 'api.core.openaip.net' && url.pathname.startsWith('/api/airports'),
    new StaleWhileRevalidate({
        cacheName: 'openaip-airports',
        plugins: [
            stripApiKey,
            new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }),
        ],
    }),
)

// OpenAIP raster tiles: api.tiles.openaip.net
// Immutable per z/x/y — cache-first with long TTL.
registerRoute(
    ({ url }) => url.hostname === 'api.tiles.openaip.net',
    new CacheFirst({
        cacheName: 'openaip-tiles',
        plugins: [
            stripApiKey,
            new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
    }),
)
