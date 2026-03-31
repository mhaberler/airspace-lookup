import './style.css'
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MarkerCallback, markerCallback } from './markerCallback';
import { AirspaceStackControl, AltitudeSliderControl, AirspaceEntry, icaoClassName } from './airspaceStack';

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
let highlightedLayer: L.Path | null = null;

function resetHighlight(): void {
    if (highlightedLayer) {
        const feature = (highlightedLayer as any).feature as GeoJSON.Feature | undefined;
        const active = feature?.properties?.active ?? true;
        highlightedLayer.setStyle({
            color: active ? '#e74c3c' : '#888888',
            weight: 2,
            fillOpacity: active ? 0.15 : 0.08,
            dashArray: active ? undefined : '5, 5',
        });
        highlightedLayer = null;
    }
}

function highlightAirspaceOnMap(entry: AirspaceEntry): void {
    resetHighlight();
    if (!currentGeojsonLayer) return;

    currentGeojsonLayer.eachLayer((layer) => {
        const feature = (layer as any).feature as GeoJSON.Feature | undefined;
        if (!feature) return;
        const props = feature.properties;
        if (props?.name === entry.name &&
            props?.lowerFt === entry.lowerFt &&
            props?.upperFt === entry.upperFt) {
            const path = layer as L.Path;
            path.setStyle({
                color: '#f1c40f',
                weight: 4,
                fillOpacity: 0.35,
            });
            path.bringToFront();
            highlightedLayer = path;
        }
    });
}

const sliderControl = new AltitudeSliderControl((ft) => {
    stackControl.setAltitude(ft);
});

const stackControl = new AirspaceStackControl({
    onMaxAltChanged: (ft) => sliderControl.setMax(ft),
    onBlockClicked: (entry) => highlightAirspaceOnMap(entry),
});
stackControl.addTo(map);
sliderControl.addTo(map);

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

    resetHighlight();
    if (currentGeojsonLayer) {
        currentGeojsonLayer.remove();
        currentGeojsonLayer = null;
    }
    if (geojson) {
        currentGeojsonLayer = L.geoJSON(geojson, {
            style: (feature) => {
                const active = feature?.properties?.active ?? true;
                return {
                    color: active ? '#e74c3c' : '#888888',
                    weight: 2,
                    fillOpacity: active ? 0.15 : 0.08,
                    dashArray: active ? undefined : '5, 5',
                };
            },
            onEachFeature: (feature, layer) => {
                const name = feature.properties?.name ?? 'Airspace';
                const lower = feature.properties?.lowerLabel ?? '?';
                const upper = feature.properties?.upperLabel ?? '?';
                const active = feature.properties?.active ?? true;
                const status = active
                    ? '<span style="color:green">ACTIVE</span>'
                    : '<span style="color:grey">INACTIVE</span>';
                const cls = icaoClassName(feature.properties?.icaoClass ?? 7);
                layer.bindPopup(`<b>${name}</b> (${cls})<br>${lower} – ${upper}<br>${status}`);
            },
        }).addTo(map);

        stackControl.update(geojson.features);
    } else {
        stackControl.clear();
    }
}

function clearAll(): void {
    if (currentMarker) {
        currentMarker.remove();
        currentMarker = null;
    }
    resetHighlight();
    if (currentGeojsonLayer) {
        currentGeojsonLayer.remove();
        currentGeojsonLayer = null;
    }
    stackControl.clear();
}

map.on('click', (e: L.LeafletMouseEvent) => onMapClick(e, markerCallback));
map.on('contextmenu', () => clearAll());
