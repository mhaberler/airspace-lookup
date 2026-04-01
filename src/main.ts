import './style.css'
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MarkerCallback, markerCallback } from './markerCallback';
import { AirspaceStackControl, AltitudeSliderControl, AirspaceEntry, icaoClassName, airspaceTypeName, activityName, airspaceColor } from './airspaceStack';

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

// ── Home / Locate button ──
const HomeControl = L.Control.extend({
    options: { position: 'topleft' as L.ControlPosition },
    onAdd(_map: L.Map) {
        const btn = L.DomUtil.create('div', 'leaflet-bar home-control') as HTMLDivElement;
        const a = L.DomUtil.create('a', '', btn) as HTMLAnchorElement;
        a.href = '#';
        a.title = 'Go to my location';
        a.innerHTML = '&#x2302;'; // ⌂
        a.role = 'button';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(a, 'click', (e) => {
            L.DomEvent.preventDefault(e);
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
                    _map.setView(latlng, 12);
                    _map.fireEvent('click', { latlng } as L.LeafletMouseEvent);
                },
                (err) => console.warn('Geolocation error:', err.message),
                { enableHighAccuracy: true, timeout: 10_000 },
            );
        });
        return btn;
    },
});
new HomeControl().addTo(map);

let currentMarker: L.Marker | null = null;
let currentGeojsonLayer: L.GeoJSON | null = null;
let highlightedLayer: L.Path | null = null;

function featureStyle(props: any): L.PathOptions {
    const active = props?.active ?? true;
    const hex = airspaceColor({
        type: props?.type ?? 0,
        icaoClass: props?.icaoClass ?? 7,
        activity: props?.activity ?? 0,
    });
    return {
        color: active ? hex : '#888888',
        weight: 2,
        fillOpacity: active ? 0.2 : 0.08,
        dashArray: active ? undefined : '5, 5',
    };
}

function resetHighlight(): void {
    if (highlightedLayer) {
        const feature = (highlightedLayer as any).feature as GeoJSON.Feature | undefined;
        highlightedLayer.setStyle(featureStyle(feature?.properties));
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
            style: (feature) => featureStyle(feature?.properties),
            onEachFeature: (feature, layer) => {
                const name = feature.properties?.name ?? 'Airspace';
                const lower = feature.properties?.lowerLabel ?? '?';
                const upper = feature.properties?.upperLabel ?? '?';
                const active = feature.properties?.active ?? true;
                const reason = feature.properties?.activeReason ?? '24h';
                const status = active
                    ? `<span style="color:green">ACTIVE</span> (${reason})`
                    : `<span style="color:grey">INACTIVE</span> (${reason})`;
                const cls = icaoClassName(feature.properties?.icaoClass ?? 7);
                const typ = airspaceTypeName(feature.properties?.type ?? 0);
                const act = feature.properties?.activity ? ` – ${activityName(feature.properties.activity)}` : '';
                const flags: string[] = feature.properties?.flags ?? [];
                const flagsHtml = flags.length ? `<br>${flags.join(', ')}` : '';
                layer.bindPopup(`<b>${name}</b> (${typ}, ${cls}${act})<br>${lower} – ${upper}<br>${status}${flagsHtml}`);
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
