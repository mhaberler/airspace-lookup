import './style.css'
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MarkerCallback, markerCallback } from './markerCallback';

L.Icon.Default.imagePath = 'img/icon/';

const openFlightMapsOverlay = {
    key: 'openflightmaps-overlay',
    name: 'OpenFlightMaps',
    url: 'https://nwy-tiles-api.prod.newaydata.com/tiles/{z}/{x}/{y}.png?path=latest/aero/latest',
    attr: '(c) <a href="https://openflightmaps.org/" target="_blank" rel="noopener noreferrer">Open Flightmaps association</a>, (c) OpenStreetMap contributors, NASA elevation data',
    maxZoom: 16,
    opacity: 0.9,
    zIndex: 2,
} as const;

const m_mono = L.tileLayer(
    'https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
});

const openFlightMapsLayer = L.tileLayer(openFlightMapsOverlay.url, {
    attribution: openFlightMapsOverlay.attr,
    maxZoom: openFlightMapsOverlay.maxZoom,
    opacity: openFlightMapsOverlay.opacity,
    zIndex: openFlightMapsOverlay.zIndex,
});

const map = L.map('map', {
    center: [47,15],
    zoom: 12,
    zoomControl: true,
    layers: [m_mono]
});

L.control.layers(
    {
        OpenStreetMap: m_mono,
    },
    {
        [openFlightMapsOverlay.name]: openFlightMapsLayer,
    },
).addTo(map);

L.control.scale({
    imperial: false,
    maxWidth: 300
}).addTo(map);

let currentMarker: L.Marker | null = null;
let currentGeojsonLayer: L.GeoJSON | null = null;

async function onMapClick(
    e: L.LeafletMouseEvent,
    callback: MarkerCallback,
): Promise<void> {
    const { lat, lng } = e.latlng;
    console.log(`Map clicked: lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}`);

    if (currentMarker) {
        currentMarker.setLatLng(e.latlng);
    } else {
        currentMarker = L.marker(e.latlng).addTo(map);
    }

    const { popupText, geojson } = await callback(lat, lng);
    currentMarker.bindPopup(popupText).openPopup();

    if (currentGeojsonLayer) {
        currentGeojsonLayer.remove();
        currentGeojsonLayer = null;
    }
    if (geojson) {
        currentGeojsonLayer = L.geoJSON(geojson, {
            style: { color: '#e74c3c', weight: 2, fillOpacity: 0.15 },
            onEachFeature: (feature, layer) => {
                const name = feature.properties?.name ?? 'Airspace';
                const type = feature.properties?.type ?? '';
                layer.bindPopup(`<b>${name}</b><br>${type}`);
            },
        }).addTo(map);
    }
}

function clearAll(): void {
    if (currentMarker) {
        currentMarker.remove();
        currentMarker = null;
    }
    if (currentGeojsonLayer) {
        currentGeojsonLayer.remove();
        currentGeojsonLayer = null;
    }
}

map.on('click', (e: L.LeafletMouseEvent) => onMapClick(e, markerCallback));
map.on('contextmenu', () => clearAll());
