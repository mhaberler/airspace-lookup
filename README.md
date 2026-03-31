# Airspace Lookup

Interactive map tool for querying airspace data at any location using the [OpenAIP](https://www.openaip.net/) API. Click anywhere on the map to see which airspaces cover that point, with altitude boundaries, operating hours, and active/inactive status.

![screenshot.png](/img/screenshot.png)

## Features

- **Airspace query**: click the map to fetch airspaces within range via OpenAIP API
- **Polygon overlay**: airspace boundaries rendered on the map; active airspaces in red, inactive in grey/dashed
- **Airspace stack**: vertical card (right side) showing all airspaces at true altitude proportions (0–40,000 ft), with contiguous airspaces stacked in shared columns
- **Altitude slider**: vertical slider (left side) to simulate aircraft altitude; the stack highlights which airspace(s) the aircraft is currently in
- **Detail popups**: click any block in the stack for full details (type, ICAO class, altitude limits, operating status)
- **OpenFlightMaps overlay**: optional aviation chart tile layer

## Setup

```bash
npm install
```

Create a `.env` file with your OpenAIP API key:

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
- **Altitude slider** (left): drag to set simulated aircraft altitude
- **Airspace stack** (right): shows vertical profile; click blocks for details

## Built with

- [Leaflet](https://leafletjs.com)
- [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vitejs.dev)

Based on [leaflet-starter](https://github.com/dayjournal/leaflet-starter) by Yasunori Kirimoto (MIT).