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

## Interaction Model

App has two modes selected in `TitleBar.vue`, plus three independent feature toggles (airspace/stack/airports) and a `follow` toggle. State is a `reactive` object in `App.vue`, synced to the URL via `?mode=`, `?show=`, `?follow=1`.

- **what-if mode** (default): map click places a pin, fetches airspaces (gated by `showAirspace`), updates stack inset (gated by `showStack`), refreshes airports (gated by `showAirports`). Preserves the original click-driven UX.
- **track mode**: starts `navigator.geolocation.watchPosition` with `enableHighAccuracy`, renders a blue-dot `L.circleMarker` + `L.circle` accuracy ring. Airspace refetch threshold is 10 km; airport refetch uses existing 150 km threshold. GPS altitude drives `stackControl.setValue`. `follow` only recenters via `panTo` when the marker leaves the viewport. On GPS error: toast + auto-revert to what-if.

## Airspace Refetch Thresholds

- **Track mode airspace**: 10 km horizontal movement (`AIRSPACE_REFETCH_THRESHOLD_M` in `App.vue`)
- **Airports (both modes)**: 150 km = `AIRPORT_FETCH_RADIUS_M / 2` (unchanged)
- Refetch is short-circuited if the corresponding toggle is off — `refreshAirports` returns early when `!state.showAirports`.

## Offline Error Handling

`markerCallback` distinguishes offline cache miss (`!navigator.onLine` → "Offline — no cached data for this location") from other errors (raw message). The `try/catch` swallows all exceptions and returns `{ popupText, geojson: null }` so the UI never crashes.
