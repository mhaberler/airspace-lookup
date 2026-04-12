const ICAO_CLASS_NAMES = [
    'Class A', 'Class B', 'Class C', 'Class D',
    'Class E', 'Class F', 'Class G', 'Other', 'SUA'
];

export function icaoClassName(icaoClass: number): string {
    return ICAO_CLASS_NAMES[icaoClass] ?? `Unknown (${icaoClass})`;
}

const AIRSPACE_TYPE_NAMES = [
    'Other',                                    // 0
    'Restricted',                               // 1
    'Danger',                                   // 2
    'Prohibited',                               // 3
    'CTR',                                      // 4
    'TMZ',                                      // 5
    'RMZ',                                      // 6
    'TMA',                                      // 7
    'TRA',                                      // 8
    'TSA',                                      // 9
    'FIR',                                      // 10
    'UIR',                                      // 11
    'ADIZ',                                     // 12
    'ATZ',                                      // 13
    'MATZ',                                     // 14
    'Airway',                                   // 15
    'MTR',                                      // 16
    'Alert Area',                               // 17
    'Warning Area',                             // 18
    'Protected Area',                           // 19
    'HTZ',                                      // 20
    'Gliding Sector',                           // 21
    'TRP',                                      // 22
    'TIZ',                                      // 23
    'TIA',                                      // 24
    'MTA',                                      // 25
    'CTA',                                      // 26
    'ACC',                                      // 27
    'Aerial Sporting/Recreational',             // 28
    'Low Altitude Overflight Restriction',      // 29
    'MRT',                                      // 30
    'TFR',                                      // 31
    'VFR Sector',                               // 32
    'FIS Sector',                               // 33
    'LTA',                                      // 34
    'UTA',                                      // 35
    'MCTR',                                     // 36
];

const ACTIVITY_NAMES = [
    'None',                         // 0
    'Parachuting',                  // 1
    'Aerobatics',                   // 2
    'Aeroclub/Aerial Work',         // 3
    'ULM',                          // 4
    'Hang Gliding/Paragliding',     // 5
];

export function activityName(activity: number): string {
    return ACTIVITY_NAMES[activity] ?? `Unknown (${activity})`;
}

export function airspaceTypeName(type: number): string {
    return AIRSPACE_TYPE_NAMES[type] ?? `Unknown (${type})`;
}

export const MIN_CEILING = 10_000; // feet – minimum stack ceiling
export const CEIL_STEP = 5_000;    // round ceiling up to this increment

// Aviation-standard color palette (hex)
// Class B/C/D (Controlled): blue   Class E: magenta
// Prohibited/Restricted/Danger: red  Glider/Parachute: green
// Warning/Caution: amber   Other/Unknown: grey
const ICAO_CLASS_HEX: Record<number, string> = {
    0: '#CC0000',   // Class A – red/dark (no VFR)
    1: '#1A73E8',   // Class B – blue
    2: '#1A73E8',   // Class C – blue
    3: '#22A7E0',   // Class D – cyan-blue
    4: '#E91E63',   // Class E – magenta
    5: '#E91E63',   // Class F – magenta
    6: '#808080',   // Class G – grey (uncontrolled)
    7: '#808080',   // Other – grey
    8: '#808080',   // SUA – grey (overridden by type)
};

// Airspace types that override ICAO class color
const TYPE_HEX_OVERRIDES: Record<number, string> = {
    1: '#FF0000',   // Restricted – red
    2: '#FFB300',   // Danger – amber
    3: '#FF0000',   // Prohibited – red
    5: '#E91E63',   // TMZ – magenta
    17: '#FFB300',  // Alert Area – amber
    18: '#FFB300',  // Warning Area – amber
    21: '#008000',  // Gliding Sector – green
    25: '#FFB300',  // MTA – amber
    28: '#008000',  // Aerial Sporting/Recreational – green
};

// Activity types that override color (parachuting, hang gliding, etc.)
const ACTIVITY_HEX_OVERRIDES: Record<number, string> = {
    1: '#008000',   // Parachuting – green
    5: '#008000',   // Hang Gliding/Paragliding – green
};

/** Get the aviation-standard hex color for an airspace entry. */
export function airspaceColor(entry: { type: number; icaoClass: number; activity: number }): string {
    if (entry.activity && ACTIVITY_HEX_OVERRIDES[entry.activity]) return ACTIVITY_HEX_OVERRIDES[entry.activity];
    if (TYPE_HEX_OVERRIDES[entry.type] !== undefined) return TYPE_HEX_OVERRIDES[entry.type];
    return ICAO_CLASS_HEX[entry.icaoClass] ?? '#808080';
}

export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface AirspaceEntry {
    name: string;
    type: number;
    icaoClass: number;
    lowerFt: number;
    upperFt: number;
    lowerLabel: string;
    upperLabel: string;
    activity: number;
    flags: string[];
    activeReason: string;
    active: boolean;
}

/** Map GeoJSON features to AirspaceEntry[] sorted by lower altitude. */
export function featuresToEntries(features: GeoJSON.Feature[]): AirspaceEntry[] {
    return features
        .map((f) => ({
            name: f.properties?.name ?? '?',
            type: f.properties?.type ?? 0,
            icaoClass: f.properties?.icaoClass ?? 0,
            lowerFt: f.properties?.lowerFt ?? 0,
            upperFt: f.properties?.upperFt ?? 0,
            lowerLabel: f.properties?.lowerLabel ?? '?',
            upperLabel: f.properties?.upperLabel ?? '?',
            activity: f.properties?.activity ?? 0,
            flags: f.properties?.flags ?? [],
            activeReason: f.properties?.activeReason ?? '24h',
            active: f.properties?.active ?? true,
        }))
        .sort((a, b) => a.lowerFt - b.lowerFt);
}

/** Compute stack ceiling: highest upperFt, rounded up, at least MIN_CEILING. */
export function computeCeiling(entries: AirspaceEntry[]): number {
    const highestFt = entries.reduce((mx, e) => Math.max(mx, e.upperFt), 0);
    return Math.max(MIN_CEILING, Math.ceil(highestFt / CEIL_STEP) * CEIL_STEP);
}

/** Pack entries into columns: a new entry joins an existing column if its
 *  lowerFt exactly matches that column's current top (upperFt). Otherwise
 *  a new column is opened. Returns a parallel array of column indices. */
export function assignColumns(entries: AirspaceEntry[]): number[] {
    const columnTops: number[] = [];
    const columnOf: number[] = [];
    for (const entry of entries) {
        const col = columnTops.findIndex((top) => top === entry.lowerFt);
        if (col >= 0) {
            columnOf.push(col);
            columnTops[col] = entry.upperFt;
        } else {
            columnOf.push(columnTops.length);
            columnTops.push(entry.upperFt);
        }
    }
    return columnOf;
}

/** Compute display-column order: columns with the lowest ICAO class at the
 *  current aircraft altitude are placed leftmost. Returns a mapping from
 *  original column index → display position. */
export function computeColumnOrder(
    entries: AirspaceEntry[],
    columnOf: number[],
    numCols: number,
    aircraftAlt: number,
): number[] {
    const colClass: number[] = new Array(numCols).fill(Infinity);
    entries.forEach((entry, i) => {
        const col = columnOf[i];
        if (aircraftAlt >= entry.lowerFt && aircraftAlt < entry.upperFt) {
            colClass[col] = Math.min(colClass[col], entry.icaoClass);
        }
    });
    const indices = Array.from({ length: numCols }, (_, i) => i);
    indices.sort((a, b) => colClass[a] - colClass[b]);
    const order: number[] = new Array(numCols);
    indices.forEach((origCol, displayPos) => {
        order[origCol] = displayPos;
    });
    return order;
}
