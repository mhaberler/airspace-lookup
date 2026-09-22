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
- Airport endpoint: `api.core.openaip.net/api/airports?pos={lat},{lng}&dist=200000` (server max allowed `dist` is 200000; larger values 400)
- Tile endpoint: `api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png`
- `apiKey` is stripped from cache keys in the SW so it doesn't appear in Cache Storage
- OpenAIP error responses (400/429) omit CORS headers, so the browser reports them as generic CORS blocks — check the actual HTTP status via curl before assuming a CORS bug

## OpenAIP Proxy (`proxy/`)

- Cloudflare Worker that fronts OpenAIP: injects the API key server-side, edge-caches responses (Cache API, TTLs matching the SW's), retries once on upstream 429, and always sets CORS headers (including on error responses — fixes the CORS-masking issue above)
- Routes: `/api/airspaces`, `/api/airports`, `/tiles/{z}/{x}/{y}.png`
- Local dev: `cd proxy && npm install && cp .dev.vars.example .dev.vars` (fill in `OPENAIP_KEY`), then `npm run dev`
- Deployed via `.github/workflows/deploy-proxy.yml` on push to `proxy/**`; needs `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` repo secrets (reuses the existing `VITE_OPENAIP_KEY` secret as the Worker's `OPENAIP_KEY`)
- Client opt-in: set `VITE_API_BASE` (repo variable, used in `deploy.yml`) to the deployed Worker URL — when unset, the client falls back to calling OpenAIP directly with `VITE_OPENAIP_KEY` (today's behavior, still used for local `npm run dev`)
- Once `VITE_API_BASE` is set for the Pages build, clear the `VITE_OPENAIP_KEY` repo secret too — otherwise it's still embedded in the client bundle even though unused at runtime

## Interaction Model

App has two modes selected in `TitleBar.vue`, plus three independent feature toggles (airspace/stack/airports) and a `follow` toggle. State is a `reactive` object in `App.vue`, synced to the URL via `?mode=`, `?show=`, `?follow=1`.

- **what-if mode** (default): map click places a pin, fetches airspaces (gated by `showAirspace`), updates stack inset (gated by `showStack`), refreshes airports (gated by `showAirports`). Preserves the original click-driven UX.
- **track mode**: starts `navigator.geolocation.watchPosition` with `enableHighAccuracy`, renders a blue-dot `L.circleMarker` + `L.circle` accuracy ring. Airspace refetch threshold is 10 km; airport refetch uses existing 150 km threshold. GPS altitude drives `stackControl.setValue`. `follow` only recenters via `panTo` when the marker leaves the viewport. On GPS error: toast + auto-revert to what-if.

## Airspace Refetch Thresholds

- **Track mode airspace**: 10 km horizontal movement (`AIRSPACE_REFETCH_THRESHOLD_M` in `App.vue`)
- **Airports (both modes)**: 100 km = `AIRPORT_FETCH_RADIUS_M / 2`
- Refetch is short-circuited if the corresponding toggle is off — `refreshAirports` returns early when `!state.showAirports`.

## Offline Error Handling

`markerCallback` distinguishes offline cache miss (`!navigator.onLine` → "Offline — no cached data for this location") from other errors (raw message). The `try/catch` swallows all exceptions and returns `{ popupText, geojson: null }` so the UI never crashes.



