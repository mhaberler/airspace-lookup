import L from 'leaflet';

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

const MIN_CEILING = 10_000; // feet – minimum stack ceiling
const CEIL_STEP = 5_000;    // round ceiling up to this increment

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

function hexToRgba(hex: string, alpha: number): string {
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
    active: boolean;
}

export class AirspaceStackControl extends L.Control {
    private container!: HTMLDivElement;
    private stackArea!: HTMLDivElement;
    private aircraftLine!: HTMLDivElement;
    private aircraftLabel!: HTMLDivElement;
    private entries: AirspaceEntry[] = [];
    private columnOf: number[] = [];   // column index per entry
    private blocks: HTMLDivElement[] = [];
    private ticks: HTMLDivElement[] = [];
    private aircraftAlt = 0;
    private maxAlt = MIN_CEILING;
    private onMaxAltChanged?: (ft: number) => void;
    private onBlockClicked?: (entry: AirspaceEntry, index: number) => void;

    constructor(opts?: {
        onMaxAltChanged?: (ft: number) => void;
        onBlockClicked?: (entry: AirspaceEntry, index: number) => void;
    }) {
        super({ position: 'bottomright' });
        this.onMaxAltChanged = opts?.onMaxAltChanged;
        this.onBlockClicked = opts?.onBlockClicked;
    }

    onAdd(_map: L.Map): HTMLElement {
        this.container = L.DomUtil.create('div', 'airspace-stack-control') as HTMLDivElement;
        L.DomEvent.disableClickPropagation(this.container);
        L.DomEvent.disableScrollPropagation(this.container);

        const title = L.DomUtil.create('div', 'airspace-stack-title', this.container) as HTMLDivElement;
        title.textContent = 'Airspace Stack';

        this.stackArea = L.DomUtil.create('div', 'airspace-stack-area', this.container) as HTMLDivElement;

        // aircraft altitude marker
        this.aircraftLine = L.DomUtil.create('div', 'airspace-stack-aircraft', this.stackArea) as HTMLDivElement;
        this.aircraftLabel = L.DomUtil.create('div', 'airspace-stack-aircraft-label', this.aircraftLine) as HTMLDivElement;
        this.setAltitude(0);

        this.renderTicks();

        return this.container;
    }

    update(features: GeoJSON.Feature[]): void {
        this.entries = features.map(f => ({
            name: f.properties?.name ?? '?',
            type: f.properties?.type ?? 0,
            icaoClass: f.properties?.icaoClass ?? 0,
            lowerFt: f.properties?.lowerFt ?? 0,
            upperFt: f.properties?.upperFt ?? 0,
            lowerLabel: f.properties?.lowerLabel ?? '?',
            upperLabel: f.properties?.upperLabel ?? '?',
            activity: f.properties?.activity ?? 0,
            flags: f.properties?.flags ?? [],
            active: f.properties?.active ?? true,
        }));

        // sort by lower altitude
        this.entries.sort((a, b) => a.lowerFt - b.lowerFt);

        // compute dynamic ceiling
        const highestFt = this.entries.reduce((mx, e) => Math.max(mx, e.upperFt), 0);
        const newMax = Math.max(MIN_CEILING, Math.ceil(highestFt / CEIL_STEP) * CEIL_STEP);
        if (newMax !== this.maxAlt) {
            this.maxAlt = newMax;
            this.renderTicks();
            this.onMaxAltChanged?.(this.maxAlt);
        }

        this.renderBlocks();
    }

    setAltitude(ft: number): void {
        this.aircraftAlt = ft;
        const pct = (ft / this.maxAlt) * 100;
        this.aircraftLine.style.bottom = `${pct}%`;
        this.aircraftLabel.textContent = `${ft.toLocaleString()} ft`;
        this.reorderAndHighlight();
    }

    clear(): void {
        this.entries = [];
        this.renderBlocks();
    }

    private renderTicks(): void {
        for (const t of this.ticks) t.remove();
        this.ticks = [];

        for (let alt = 0; alt <= this.maxAlt; alt += CEIL_STEP) {
            const tick = L.DomUtil.create('div', 'airspace-stack-tick', this.stackArea) as HTMLDivElement;
            tick.style.bottom = `${(alt / this.maxAlt) * 100}%`;
            const label = alt >= 10000 ? `${alt / 1000}k` : `${alt}`;
            tick.dataset.label = label;
            this.ticks.push(tick);
        }
    }

    private renderBlocks(): void {
        // remove old blocks
        for (const b of this.blocks) b.remove();
        this.blocks = [];

        if (this.entries.length === 0) {
            this.columnOf = [];
            this.container.style.width = '';
            return;
        }

        // assign columns: contiguous airspaces (one's upperFt == another's lowerFt) share a column
        const columnTops: number[] = [];  // upperFt of the topmost entry in each column
        this.columnOf = [];

        for (const entry of this.entries) {
            const col = columnTops.findIndex(top => top === entry.lowerFt);
            if (col >= 0) {
                this.columnOf.push(col);
                columnTops[col] = entry.upperFt;
            } else {
                this.columnOf.push(columnTops.length);
                columnTops.push(entry.upperFt);
            }
        }

        const numCols = columnTops.length;

        // responsive width: 5vw per column, min 5vw
        const vw = Math.max(numCols * 3, 3);
        this.container.style.width = `${vw}vw`;

        // sort columns by ICAO class at current altitude, then render
        const colOrder = this.computeColumnOrder(numCols);

        this.entries.forEach((entry, i) => {
            const bottomPct = (entry.lowerFt / this.maxAlt) * 100;
            const topPct = (entry.upperFt / this.maxAlt) * 100;
            const heightPct = topPct - bottomPct;
            const displayCol = colOrder[this.columnOf[i]];
            const colWidth = 100 / numCols;

            const block = L.DomUtil.create('div', 'airspace-block', this.stackArea) as HTMLDivElement;
            block.style.bottom = `${bottomPct}%`;
            block.style.height = `${heightPct}%`;
            block.style.left = `${displayCol * colWidth}%`;
            block.style.width = `${colWidth}%`;
            const hex = airspaceColor(entry);
            block.style.backgroundColor = hexToRgba(hex, 0.35);
            block.style.borderColor = hexToRgba(hex, 0.8);

            const label = L.DomUtil.create('div', 'airspace-block-label', block) as HTMLDivElement;
            label.innerHTML = `<span class="airspace-block-name">${entry.name}</span>`;

            block.addEventListener('click', () => {
                this.showDetail(entry, block);
                this.onBlockClicked?.(entry, i);
            });
            block.title = `${entry.name}: ${entry.lowerLabel} – ${entry.upperLabel}`;

            this.blocks.push(block);
        });

        this.highlightCurrent();
    }

    /** Compute a mapping from original column index → display column index,
     *  sorted so the column with the lowest ICAO class at current altitude is leftmost. */
    private computeColumnOrder(numCols: number): number[] {
        // For each column, find the best (lowest) ICAO class of any entry at the current altitude
        const colClass: number[] = new Array(numCols).fill(Infinity);
        this.entries.forEach((entry, i) => {
            const col = this.columnOf[i];
            if (this.aircraftAlt >= entry.lowerFt && this.aircraftAlt < entry.upperFt) {
                colClass[col] = Math.min(colClass[col], entry.icaoClass);
            }
        });

        // Create sorted column indices: lowest class first, then columns not at current alt
        const indices = Array.from({ length: numCols }, (_, i) => i);
        indices.sort((a, b) => colClass[a] - colClass[b]);

        // Build reverse mapping: original col → display position
        const order: number[] = new Array(numCols);
        indices.forEach((origCol, displayPos) => {
            order[origCol] = displayPos;
        });
        return order;
    }

    /** Re-sort columns and update highlights when altitude changes. */
    private reorderAndHighlight(): void {
        if (this.entries.length === 0 || this.blocks.length === 0) return;

        const numCols = new Set(this.columnOf).size;
        const colOrder = this.computeColumnOrder(numCols);
        const colWidth = 100 / numCols;

        this.entries.forEach((_entry, i) => {
            const block = this.blocks[i];
            if (!block) return;
            const displayCol = colOrder[this.columnOf[i]];
            block.style.left = `${displayCol * colWidth}%`;
        });

        this.highlightCurrent();
    }

    private highlightCurrent(): void {
        this.entries.forEach((entry, i) => {
            const block = this.blocks[i];
            if (!block) return;
            const inside = this.aircraftAlt >= entry.lowerFt && this.aircraftAlt < entry.upperFt;
            const hex = airspaceColor(entry);
            if (inside) {
                block.style.backgroundColor = hexToRgba(hex, 0.7);
                block.classList.add('airspace-block-active');
            } else {
                block.style.backgroundColor = hexToRgba(hex, 0.35);
                block.classList.remove('airspace-block-active');
            }
        });
    }

    private showDetail(entry: AirspaceEntry, _anchor: HTMLElement): void {
        // remove any existing detail popup
        const old = this.container.querySelector('.airspace-detail-popup');
        if (old) old.remove();

        const popup = L.DomUtil.create('div', 'airspace-detail-popup', this.container) as HTMLDivElement;
        const activeHtml = entry.active
            ? '<span style="color:green">ACTIVE</span>'
            : '<span style="color:grey">INACTIVE</span>';
        popup.innerHTML = `
            <div class="airspace-detail-close">&times;</div>
            <b>${entry.name}</b><br>
            ${airspaceTypeName(entry.type)}, ${icaoClassName(entry.icaoClass)}<br>${entry.activity ? `            ${activityName(entry.activity)}<br>` : ''}
            Lower: ${entry.lowerLabel} (${entry.lowerFt.toLocaleString()} ft)<br>
            Upper: ${entry.upperLabel} (${entry.upperFt.toLocaleString()} ft)<br>
            Status: ${activeHtml}${entry.flags.length ? `<br>${entry.flags.join(', ')}` : ''}
        `;
        popup.querySelector('.airspace-detail-close')!.addEventListener('click', () => popup.remove());
    }
}

export class AltitudeSliderControl extends L.Control {
    private container!: HTMLDivElement;
    private slider!: HTMLInputElement;
    private label!: HTMLDivElement;
    private onChange: (ft: number) => void;

    constructor(onChange: (ft: number) => void) {
        super({ position: 'bottomleft' });
        this.onChange = onChange;
    }

    onAdd(_map: L.Map): HTMLElement {
        this.container = L.DomUtil.create('div', 'altitude-slider-control') as HTMLDivElement;
        L.DomEvent.disableClickPropagation(this.container);
        L.DomEvent.disableScrollPropagation(this.container);

        const title = L.DomUtil.create('div', 'altitude-slider-title', this.container) as HTMLDivElement;
        title.textContent = 'ALT';

        this.slider = L.DomUtil.create('input', 'altitude-slider', this.container) as HTMLInputElement;
        this.slider.type = 'range';
        this.slider.min = '0';
        this.slider.max = String(MIN_CEILING);
        this.slider.step = '100';
        this.slider.value = '0';

        this.label = L.DomUtil.create('div', 'altitude-slider-label', this.container) as HTMLDivElement;
        this.label.textContent = '0 ft';

        this.slider.addEventListener('input', () => {
            const ft = parseInt(this.slider.value, 10);
            this.label.textContent = `${ft.toLocaleString()} ft`;
            this.onChange(ft);
        });

        return this.container;
    }

    setMax(ft: number): void {
        this.slider.max = String(ft);
    }
}
