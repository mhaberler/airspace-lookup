const API_KEY = import.meta.env.VITE_OPENAIP_KEY as string;
const DIST_METERS = 10;

export type MarkerCallback = (lat: number, lng: number) => Promise<{ popupText: string; geojson: GeoJSON.FeatureCollection | null }>;

interface AirspaceItem {
    _id: string;
    name: string;
    type: number;
    icaoClass: number;
    geometry: GeoJSON.Geometry;
}

export const markerCallback: MarkerCallback = async (lat, lng) => {
    const url = `https://api.core.openaip.net/api/airspaces?pos=${lat},${lng}&dist=${DIST_METERS}&apiKey=${API_KEY}`;
    console.log('OpenAIP request:', url);

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const items: AirspaceItem[] = data.items ?? [];
        const popupText = items.length
            ? items.map(a => `<b>${a.name}</b> (type ${a.type})`).join('<br>')
            : `No airspaces within ${DIST_METERS} nm`;

        const geojson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: items
                .filter(a => a.geometry)
                .map(a => ({
                    type: 'Feature' as const,
                    geometry: a.geometry,
                    properties: { name: a.name, type: a.type, icaoClass: a.icaoClass },
                })),
        };

        return { popupText, geojson };
    } catch (err) {
        console.error('OpenAIP error:', err);
        return { popupText: `Error: ${err}`, geojson: null };
    }
};
