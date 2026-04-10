# airspace-lookup

## Dependencies
- `npm install` always requires `--legacy-peer-deps` (`@maxel01/vue-leaflet` has peer dep conflicts)

## Environment
- API key lives in `.env` as `VITE_OPENAIP_KEY`; git-worktrees don't inherit it — symlink from the main repo root
- Vite dev server: port 5173 (`npm run dev`), preview: port 4173 (`npm run preview`)

## Service Worker
- `src/sw.ts` is compiled by vite-plugin-pwa (injectManifest mode) into `dist/sw.js`
- `skipWaiting` must be imported from `workbox-core`, not called as `self.skipWaiting()` (TS error)
- Offline caching only serves previously visited coordinates; cold cache misses still fail offline

## API
- Airspace endpoint: `api.core.openaip.net/api/airspaces?pos={lat},{lng}&dist=10`
- Airport endpoint: `api.core.openaip.net/api/airports?pos={lat},{lng}&dist=300000`
- Tile endpoint: `api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png`
- `apiKey` is stripped from cache keys in the SW so it doesn't appear in Cache Storage
