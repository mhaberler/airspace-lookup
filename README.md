# Airspace Lookup

Interactive map tool for querying airspace data at any location using the [OpenAIP](https://www.openaip.net/) API. Click anywhere on the map to see which airspaces cover that point, with altitude boundaries, operating hours, and active/inactive status.

![screenshot.png](/img/screenshot.png)

## Features

- **Airspace query**: click the map to fetch airspaces within range via OpenAIP API
- **Polygon overlay**: airspace boundaries rendered on the map with aviation-standard coloring (blue for controlled B/C/D, magenta for E/F, red for restricted/prohibited, amber for danger/warning, green for gliding/parachuting); inactive airspaces shown in grey/dashed
- **Airspace stack**: vertical card showing all airspaces at true altitude proportions with dynamic ceiling (rounded to next 5,000 ft, minimum 10,000 ft); responsive width adapts to the number of airspace columns
- **ICAO class sorting**: stack columns are sorted horizontally by ICAO class at the current altitude (most restrictive leftmost), re-sorting as altitude changes
- **Altitude slider**: touch-friendly custom vertical slider (right of the stack) with pointer-event based dragging for reliable mobile use
- **Detail popups**: click any block in the stack for full details including airspace type name (CTR, TMA, CTA, etc.), ICAO class (A–G), activity (parachuting, gliding, etc.), altitude limits, operating status with reason (24h, By NOTAM, sunrise–sunset with computed times), and operational flags (On Demand, On Request, etc.)
- **Map highlight**: clicking a stack block highlights the corresponding polygon on the map
- **Sunrise/sunset awareness**: operating hours that reference sunrise/sunset are resolved to actual UTC times based on the queried location
- **Home button**: geolocates your position, centers the map, places a marker, loads airspaces, and sets the altitude slider if GPS altitude is available
- **Share button**: copies a deep-link URL with current location, zoom, and altitude to the clipboard
- **URL deep-linking**: open the app with `?lat=...&lng=...&z=...&alt=...` to restore a specific view with airspaces loaded
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

## Usage

- **Left click** on the map: query airspaces at that location
- **Right click**: clear markers and polygons
- **Home button** (top-left): geolocate and center map at your position
- **Share button** (top-left): copy a shareable URL to the clipboard
- **Altitude slider** (right, next to stack): drag to set simulated aircraft altitude
- **Airspace stack** (right): shows vertical profile; click blocks for details and to highlight the polygon on the map

## Built with

- [Leaflet](https://leafletjs.com)
- [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vitejs.dev)

Based on [leaflet-starter](https://github.com/dayjournal/leaflet-starter) by Yasunori Kirimoto (MIT).