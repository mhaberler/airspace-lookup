# Airspace Lookup

Interactive map tool for querying airspace data at any location using the [OpenAIP](https://www.openaip.net/) API. Click anywhere on the map to see which airspaces cover that point, with altitude boundaries, operating hours, and active/inactive status.



![screenshot.jpg](/img/screenshot.jpg)

## Features

- **Airspace query**: click the map to fetch airspaces within range via OpenAIP API
- **Polygon overlay**: airspace boundaries rendered on the map with aviation-standard coloring (blue for controlled B/C/D, magenta for E/F, red for restricted/prohibited, amber for danger/warning, green for gliding/parachuting); inactive airspaces shown in grey/dashed
- **Airspace stack**: vertical card showing all airspaces at true altitude proportions with dynamic ceiling (rounded to next 5,000 ft, minimum 10,000 ft); responsive width adapts to the number of airspace columns
- **ICAO class sorting**: stack columns are sorted horizontally by ICAO class at the current altitude (most restrictive leftmost), re-sorting as altitude changes
- **Altitude line**: drag the red horizontal line in the airspace stack up or down to set the simulated aircraft altitude; current altitude shown in the stack header
- **Detail popups**: click any block in the stack for full details including airspace type name (CTR, TMA, CTA, etc.), ICAO class (A–G), activity (parachuting, gliding, etc.), altitude limits, operating status with reason (24h, By NOTAM, sunrise–sunset with computed times), and operational flags (On Demand, On Request, etc.)
- **Map highlight**: clicking a stack block highlights the corresponding polygon on the map
- **Airports**: airports and airfields with radio frequencies are displayed as colour-coded circle markers (blue = international, teal = heliport, green = other); markers refresh automatically as you pan or zoom; click a marker for name, ICAO/IATA code, type, elevation, runway dimensions and surface type, and ATS communication frequencies
- **Sunrise/sunset awareness**: operating hours that reference sunrise/sunset are resolved to actual UTC times based on the queried location
- **Home button**: geolocates your position, centers the map, places a marker, loads airspaces, and sets the altitude slider if GPS altitude is available
- **Share button**: copies a deep-link URL with current location, zoom, and altitude to the clipboard
- **URL deep-linking**: open the app with `?lat=...&lng=...&z=...&alt=...` to restore a specific view with airspaces loaded
- **Two operating modes**: switch between click-driven what-if exploration and live GPS-based track mode, with mode and toggle state synced into the URL
- **Follow mode**: in track mode, an optional follow toggle recenters the map only when your live position leaves the current viewport
- **Offline support for cached locations**: the service worker caches previously visited map tiles and API responses so revisiting the same area can keep working offline; first-time queries for uncached coordinates still require connectivity
- **Live URL updates**: the browser URL updates as you click locations, zoom, or change altitude
- **OpenFlightMaps overlay**: optional aviation chart tile layer

## Setup

```bash
npm install
```

This app uses the [OpenAIP API](https://www.openaip.net/) to query airspace data. You need a free API token:

1. Register at [openaip.net](https://www.openaip.net/) and create an API token in your account settings
2. Create a `.env` file with your token:

```bash
VITE_OPENAIP_KEY=your_api_key_here
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages deployment

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and deploys to GitHub Pages on every push to `main`.

Add `VITE_OPENAIP_KEY` as a **repository secret** under Settings > Secrets and variables > Actions.

## Interaction modes

The app supports two map interaction modes, selected from the title bar:

- **What-if mode**: the default mode. Click anywhere on the map to drop a marker, fetch airspaces for that location, update the vertical stack, and refresh nearby airports. This preserves the original click-to-inspect workflow for planning and scenario testing.
- **Track mode**: starts a live GPS watch using the browser geolocation API. The map shows your current position with an accuracy ring, refreshes airspaces as you move, refreshes airports over a larger movement threshold, and uses GPS altitude to drive the airspace stack altitude indicator when available.
- **Follow toggle**: available in track mode. When enabled, the map pans only when your live position moves outside the current viewport, avoiding constant recentering while still keeping you visible.

Mode and feature toggles are reflected in the URL through query parameters such as `?mode=`, `?show=`, and `?follow=1`, so the current view can be shared or restored.

## Caching and offline use

The app includes a service worker that caches assets, map tiles, and API responses for locations you have already visited. That allows the app to keep working offline for repeat lookups in previously viewed areas.

Offline support is not a full preloaded dataset: if you request coordinates that are not already cached, the lookup will fail until the device is back online. In that case the app reports an offline cache miss instead of crashing.

## Usage

- **Left click** on the map in what-if mode: query airspaces at that location
- **Track mode**: use the title bar to start live GPS tracking; the app will revert to what-if mode if geolocation fails
- **Right click**: clear markers and polygons
- **Home button** (top-left): geolocate and center map at your position
- **Share button** (top-left): copy a shareable URL to the clipboard
- **Airspace stack** (bottom-right): shows vertical profile; drag the red altitude line to set simulated aircraft altitude; click blocks for details and to highlight the polygon on the map
- **Airport markers**: automatically shown within 100 km of the map centre; click for ICAO code, frequencies, and runway info

## Built with

- [Leaflet](https://leafletjs.com)
- [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vitejs.dev)

Based on [leaflet-starter](https://github.com/dayjournal/leaflet-starter) by Yasunori Kirimoto (MIT).