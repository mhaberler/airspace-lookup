import { icaoClassName, airspaceTypeName, activityName } from './airspaceStack';

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
    activity?: number;
    onDemand?: boolean;
    onRequest?: boolean;
    byNotam?: boolean;
    specialAgreement?: boolean;
    requestCompliance?: boolean;
}

function toFeet(limit: AltitudeLimit): number {
    return limit.unit === 6 ? limit.value * 100 : limit.value;
}

function formatAltitude(limit: AltitudeLimit): string {
    if (limit.unit === 6) return `FL${limit.value}`;
    return `${limit.value} ft`;
}

/** Simplified sunrise/sunset calculator — returns UTC times as "HH:MM". */
function computeSunTimes(lat: number, lng: number, date: Date): { sunrise: string; sunset: string } {
    const rad = Math.PI / 180;
    const dayOfYear = Math.floor(
        (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000,
    );

    // solar declination (Spencer, 1971)
    const B = ((dayOfYear - 1) * 360) / 365;
    const Br = B * rad;
    const decl =
        0.006918 -
        0.399912 * Math.cos(Br) +
        0.070257 * Math.sin(Br) -
        0.006758 * Math.cos(2 * Br) +
        0.000907 * Math.sin(2 * Br) -
        0.002697 * Math.cos(3 * Br) +
        0.00148 * Math.sin(3 * Br);

    // hour angle at sunrise/sunset (zenith 90.833° for atmospheric refraction)
    const latRad = lat * rad;
    const cosH =
        (Math.cos(90.833 * rad) - Math.sin(latRad) * Math.sin(decl)) /
        (Math.cos(latRad) * Math.cos(decl));

    // polar day/night guard
    if (cosH > 1) return { sunrise: '00:00', sunset: '00:00' }; // polar night → treat as 24h dark
    if (cosH < -1) return { sunrise: '00:00', sunset: '23:59' }; // polar day → treat as 24h light

    const H = Math.acos(cosH) / rad; // degrees

    // equation of time (minutes)
    const EoT =
        229.18 *
        (0.000075 +
            0.001868 * Math.cos(Br) -
            0.032077 * Math.sin(Br) -
            0.014615 * Math.cos(2 * Br) -
            0.04089 * Math.sin(2 * Br));

    const solarNoon = 720 - 4 * lng - EoT; // minutes UTC
    const sunriseMin = solarNoon - 4 * H;
    const sunsetMin = solarNoon + 4 * H;

    const fmt = (m: number) => {
        const clamped = ((m % 1440) + 1440) % 1440;
        const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
        const mm = String(Math.round(clamped % 60)).padStart(2, '0');
        return `${hh}:${mm}`;
    };
    return { sunrise: fmt(sunriseMin), sunset: fmt(sunsetMin) };
}

interface ActiveResult {
    active: boolean;
    reason: string;
}

function isActive(hours: HoursOfOperation, lat: number, lng: number): ActiveResult {
    const now = new Date();
    const todayDow = now.getUTCDay(); // 0=Sun … 6=Sat
    const entry = hours.operatingHours.find(e => e.dayOfWeek === todayDow);
    if (!entry) return { active: false, reason: 'No schedule' };
    if (entry.byNotam) return { active: false, reason: 'By NOTAM' };

    const sun = computeSunTimes(lat, lng, now);
    const start = entry.sunrise ? sun.sunrise : entry.startTime;
    const end = entry.sunset ? sun.sunset : entry.endTime;

    // 00:00–00:00 with no sunrise/sunset flags means 24h
    if (start === '00:00' && end === '00:00' && !entry.sunrise && !entry.sunset) {
        return { active: true, reason: '24h' };
    }

    // Build reason label
    const startLabel = entry.sunrise ? `SR ${sun.sunrise}` : start;
    const endLabel = entry.sunset ? `SS ${sun.sunset}` : end;
    const reason = `${startLabel}–${endLabel} UTC`;

    const pad = (n: number) => String(n).padStart(2, '0');
    const current = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
    const active = current >= start && current < end;
    return { active, reason };
}

const FLAG_LABELS: [keyof AirspaceItem, string][] = [
    ['onDemand', 'On Demand'],
    ['onRequest', 'On Request'],
    ['byNotam', 'By NOTAM'],
    ['specialAgreement', 'Special Agreement'],
    ['requestCompliance', 'Request Compliance'],
];

function activeFlags(a: AirspaceItem): string[] {
    return FLAG_LABELS.filter(([key]) => a[key]).map(([, label]) => label);
}

export const markerCallback: MarkerCallback = async (lat, lng) => {
    const url = `https://api.core.openaip.net/api/airspaces?pos=${lat},${lng}&dist=${DIST_METERS}&apiKey=${API_KEY}`;
    console.log('OpenAIP request:', url);

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const items: AirspaceItem[] = data.items ?? [];
        items.sort((a, b) => (a.lowerLimit ? toFeet(a.lowerLimit) : 0) - (b.lowerLimit ? toFeet(b.lowerLimit) : 0));

        const popupText = items.length
            ? items.map(a => {
                const lower = a.lowerLimit ? formatAltitude(a.lowerLimit) : '?';
                const upper = a.upperLimit ? formatAltitude(a.upperLimit) : '?';
                const { active, reason } = a.hoursOfOperation
                    ? isActive(a.hoursOfOperation, lat, lng)
                    : { active: true, reason: '24h' };
                const status = active
                    ? `<span style="color:green">ACTIVE</span> (${reason})`
                    : `<span style="color:grey">INACTIVE</span> (${reason})`;
                const act = a.activity ? ` – ${activityName(a.activity)}` : '';
                const flags = activeFlags(a);
                const flagsHtml = flags.length ? ` [${flags.join(', ')}]` : '';
                return `<b>${a.name}</b> (${airspaceTypeName(a.type)}, ${icaoClassName(a.icaoClass)}${act}) — ${lower} / ${upper} — ${status}${flagsHtml}`;
            }).join('<br>')
            : `No airspaces within ${DIST_METERS} nm`;

        const geojson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: items
                .filter(a => a.geometry)
                .map(a => {
                    const { active, reason } = a.hoursOfOperation
                        ? isActive(a.hoursOfOperation, lat, lng)
                        : { active: true, reason: '24h' };
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
                            ...(a.activity ? { activity: a.activity } : {}),
                            flags: activeFlags(a),
                            activeReason: reason,
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
