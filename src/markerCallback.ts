import { icaoClassName, airspaceTypeName, activityName } from './airspaceStack';

const API_KEY = import.meta.env.VITE_OPENAIP_KEY as string;
const DIST_METERS = 10;
export const AIRPORT_FETCH_RADIUS_M = 300000;

// ── Airport type names ──────────────────────────────────────────────────────
const AIRPORT_TYPE_NAMES: Record<number, string> = {
    0: 'Other',
    1: 'Glider Site',
    2: 'Airfield',
    3: 'Int\'l Airport',
    4: 'Heliport',
    5: 'Military',
    6: 'Ultralight',
    7: 'Helipad',
    8: 'Seaplane Base',
    9: 'Hang Gliding',
};

export function airportTypeName(type: number): string {
    return AIRPORT_TYPE_NAMES[type] ?? `Type ${type}`;
}

// ── Frequency type names ────────────────────────────────────────────────────
const FREQ_TYPE_NAMES: Record<number, string> = {
    0: 'Other',
    1: 'Approach',
    2: 'Apron',
    3: 'Arrival',
    4: 'Center',
    5: 'Clearance',
    6: 'CTAF',
    7: 'Departure',
    8: 'FIS',
    9: 'Gliding',
    10: 'Ground',
    11: 'Info',
    12: 'Multicom',
    13: 'Radar',
    14: 'Tower',
    15: 'ATIS',
    16: 'Radio',
    17: 'UNICOM',
    18: 'VOLMET',
    19: 'AFIS',
};

function freqTypeName(type: number): string {
    return FREQ_TYPE_NAMES[type] ?? `Type ${type}`;
}

// ── Runway surface composition names ───────────────────────────────────────
const SURFACE_NAMES: Record<number, string> = {
    0: 'Unknown',
    1: 'Asphalt',
    2: 'Grass',
    3: 'Concrete',
    4: 'Sand',
    5: 'Gravel',
    6: 'Water',
    7: 'Ice',
    8: 'Snow',
    9: 'Dirt',
};

function surfaceName(code: number): string {
    return SURFACE_NAMES[code] ?? `Surface ${code}`;
}

// ── Airport interfaces ──────────────────────────────────────────────────────
interface AirportFrequency {
    value: string;
    unit: number;
    type: number;
    name: string;
    primary: boolean;
    publicUse: boolean;
}

interface AirportRunway {
    designator: string;
    trueHeading: number;
    mainRunway: boolean;
    takeOffOnly: boolean;
    landingOnly: boolean;
    surface?: { mainComposite?: number };
    dimension?: { length?: { value: number; unit: number }; width?: { value: number; unit: number } };
}

export interface AirportItem {
    _id: string;
    name: string;
    icaoCode?: string;
    iataCode?: string;
    type: number;
    geometry: GeoJSON.Point;
    elevation?: { value: number; unit: number };
    ppr: boolean;
    private: boolean;
    skydiveActivity: boolean;
    winchOnly: boolean;
    frequencies?: AirportFrequency[];
    runways?: AirportRunway[];
}

export function airportPopupHtml(a: AirportItem): string {
    const icao = a.icaoCode ? ` <b>${a.icaoCode}</b>` : '';
    const iata = a.iataCode ? ` / ${a.iataCode}` : '';
    const elev = a.elevation ? ` · ${a.elevation.value} ft MSL` : '';
    const flags = [
        a.ppr ? 'PPR' : '',
        a.private ? 'Private' : '',
        a.skydiveActivity ? 'Skydive' : '',
        a.winchOnly ? 'Winch only' : '',
    ].filter(Boolean);
    const flagsHtml = flags.length ? `<br><span style="color:#888">${flags.join(' · ')}</span>` : '';

    // Runways
    let runwaysHtml = '';
    if (a.runways?.length) {
        const rwyLines = a.runways
            .filter(r => r.mainRunway !== false)
            .map(r => {
                const surf = r.surface?.mainComposite != null ? surfaceName(r.surface.mainComposite) : '';
                const len = r.dimension?.length ? `${r.dimension.length.value} m` : '';
                const width = r.dimension?.width ? `×${r.dimension.width.value} m` : '';
                const ops = r.takeOffOnly ? ' (T/O only)' : r.landingOnly ? ' (Ldg only)' : '';
                return `RWY ${r.designator} ${len}${width} ${surf}${ops}`.trim();
            });
        if (rwyLines.length) runwaysHtml = `<br><b>Runways:</b> ${rwyLines.join(', ')}`;
    }

    // ATS Communications
    let freqHtml = '';
    if (a.frequencies?.length) {
        const lines = a.frequencies
            .sort((x, y) => (y.primary ? 1 : 0) - (x.primary ? 1 : 0))
            .map(f => {
                const primary = f.primary ? '<b>' : '';
                const primaryEnd = f.primary ? '</b>' : '';
                return `${primary}${freqTypeName(f.type)} ${f.value} MHz${primaryEnd}${f.name && f.name !== f.value ? ` <i>${f.name}</i>` : ''}`;
            });
        freqHtml = `<br><b>ATS Comm:</b><br>${lines.join('<br>')}`;
    }

    return `<b>${a.name}</b>${icao}${iata}<br>${airportTypeName(a.type)}${elev}${flagsHtml}${runwaysHtml}${freqHtml}`;
}

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
            : `No airspaces within ${DIST_METERS} m`;

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
        const msg = !navigator.onLine
            ? 'Offline — no cached data for this location'
            : `Error: ${err}`;
        return { popupText: msg, geojson: null };
    }
};

export async function fetchAirports(lat: number, lng: number): Promise<AirportItem[]> {
    const url = `https://api.core.openaip.net/api/airports?pos=${lat},${lng}&dist=${AIRPORT_FETCH_RADIUS_M}&apiKey=${API_KEY}`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.items as AirportItem[]).filter(a => a.frequencies?.length);
    } catch (err) {
        console.error('Airport fetch error:', err);
        return [];
    }
}
