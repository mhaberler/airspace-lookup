const API_KEY = import.meta.env.VITE_OPENAIP_KEY as string;
const DIST_METERS = 10;

export type MarkerCallback = (lat: number, lng: number) => Promise<{ popupText: string; geojson: GeoJSON.FeatureCollection | null }>;

interface AltitudeLimit {
    value: number;
    unit: number;        // 1 = feet, 6 = FL
    referenceDatum: number;
}

interface OperatingHourEntry {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    byNotam: boolean;
    sunrise: boolean;
    sunset: boolean;
    publicHolidaysExcluded: boolean;
}

interface HoursOfOperation {
    operatingHours: OperatingHourEntry[];
}

interface AirspaceItem {
    _id: string;
    name: string;
    type: number;
    icaoClass: number;
    geometry: GeoJSON.Geometry;
    lowerLimit?: AltitudeLimit;
    upperLimit?: AltitudeLimit;
    hoursOfOperation?: HoursOfOperation;
}

function toFeet(limit: AltitudeLimit): number {
    return limit.unit === 6 ? limit.value * 100 : limit.value;
}

function formatAltitude(limit: AltitudeLimit): string {
    if (limit.unit === 6) return `FL${limit.value}`;
    return `${limit.value} ft`;
}

function isActive(hours: HoursOfOperation): boolean {
    const now = new Date();
    const todayDow = now.getUTCDay(); // 0=Sun … 6=Sat
    const entry = hours.operatingHours.find(e => e.dayOfWeek === todayDow);
    if (!entry) return false;
    if (entry.byNotam) return false;
    if (entry.startTime === '00:00' && entry.endTime === '00:00') return true;
    const pad = (n: number) => String(n).padStart(2, '0');
    const current = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
    return current >= entry.startTime && current < entry.endTime;
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
            ? items.map(a => {
                const lower = a.lowerLimit ? formatAltitude(a.lowerLimit) : '?';
                const upper = a.upperLimit ? formatAltitude(a.upperLimit) : '?';
                const active = a.hoursOfOperation ? isActive(a.hoursOfOperation) : true;
                const status = active ? '<span style="color:green">ACTIVE</span>' : '<span style="color:grey">INACTIVE</span>';
                return `<b>${a.name}</b> (type ${a.type}) — ${lower} / ${upper} — ${status}`;
            }).join('<br>')
            : `No airspaces within ${DIST_METERS} nm`;

        const geojson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: items
                .filter(a => a.geometry)
                .map(a => {
                    const active = a.hoursOfOperation ? isActive(a.hoursOfOperation) : true;
                    return {
                        type: 'Feature' as const,
                        geometry: a.geometry,
                        properties: {
                            name: a.name,
                            type: a.type,
                            icaoClass: a.icaoClass,
                            lowerLabel: a.lowerLimit ? formatAltitude(a.lowerLimit) : '?',
                            upperLabel: a.upperLimit ? formatAltitude(a.upperLimit) : '?',
                            lowerFt: a.lowerLimit ? toFeet(a.lowerLimit) : 0,
                            upperFt: a.upperLimit ? toFeet(a.upperLimit) : 0,
                            active,
                        },
                    };
                }),
        };

        return { popupText, geojson };
    } catch (err) {
        console.error('OpenAIP error:', err);
        return { popupText: `Error: ${err}`, geojson: null };
    }
};
