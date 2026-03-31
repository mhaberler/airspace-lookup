import L from 'leaflet';

const MIN_CEILING = 10_000; // feet – minimum stack ceiling
const CEIL_STEP = 5_000;    // round ceiling up to this increment

const BLOCK_COLORS = [
    'rgba(52, 152, 219, 0.35)',   // blue
    'rgba(46, 204, 113, 0.35)',   // green
    'rgba(155, 89, 182, 0.35)',   // purple
    'rgba(230, 126, 34, 0.35)',   // orange
    'rgba(241, 196, 15, 0.35)',   // yellow
    'rgba(231, 76, 60, 0.35)',    // red
    'rgba(26, 188, 156, 0.35)',   // teal
    'rgba(127, 140, 141, 0.35)',  // grey
];

const HIGHLIGHT_COLORS = [
    'rgba(52, 152, 219, 0.7)',
    'rgba(46, 204, 113, 0.7)',
    'rgba(155, 89, 182, 0.7)',
    'rgba(230, 126, 34, 0.7)',
    'rgba(241, 196, 15, 0.7)',
    'rgba(231, 76, 60, 0.7)',
    'rgba(26, 188, 156, 0.7)',
    'rgba(127, 140, 141, 0.7)',
];

export interface AirspaceEntry {
    name: string;
    type: number;
    icaoClass: number;
    lowerFt: number;
    upperFt: number;
    lowerLabel: string;
    upperLabel: string;
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
            block.style.backgroundColor = BLOCK_COLORS[i % BLOCK_COLORS.length];
            block.style.borderColor = BLOCK_COLORS[i % BLOCK_COLORS.length].replace('0.35', '0.8');

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
            if (inside) {
                block.style.backgroundColor = HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length];
                block.classList.add('airspace-block-active');
            } else {
                block.style.backgroundColor = BLOCK_COLORS[i % BLOCK_COLORS.length];
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
            Type: ${entry.type}<br>
            ICAO Class: ${entry.icaoClass}<br>
            Lower: ${entry.lowerLabel} (${entry.lowerFt.toLocaleString()} ft)<br>
            Upper: ${entry.upperLabel} (${entry.upperFt.toLocaleString()} ft)<br>
            Status: ${activeHtml}
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
