import L from 'leaflet';

const MAX_ALT = 40_000; // feet

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

interface AirspaceEntry {
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
    private blocks: HTMLDivElement[] = [];
    private aircraftAlt = 0;

    constructor() {
        super({ position: 'topright' });
    }

    onAdd(_map: L.Map): HTMLElement {
        this.container = L.DomUtil.create('div', 'airspace-stack-control') as HTMLDivElement;
        L.DomEvent.disableClickPropagation(this.container);
        L.DomEvent.disableScrollPropagation(this.container);

        const title = L.DomUtil.create('div', 'airspace-stack-title', this.container) as HTMLDivElement;
        title.textContent = 'Airspace Stack';

        this.stackArea = L.DomUtil.create('div', 'airspace-stack-area', this.container) as HTMLDivElement;

        // altitude scale ticks
        for (const alt of [0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000]) {
            const tick = L.DomUtil.create('div', 'airspace-stack-tick', this.stackArea) as HTMLDivElement;
            tick.style.bottom = `${(alt / MAX_ALT) * 100}%`;
            const label = alt >= 10000 ? `${alt / 1000}k` : `${alt}`;
            tick.dataset.label = label;
        }

        // aircraft altitude marker
        this.aircraftLine = L.DomUtil.create('div', 'airspace-stack-aircraft', this.stackArea) as HTMLDivElement;
        this.aircraftLabel = L.DomUtil.create('div', 'airspace-stack-aircraft-label', this.aircraftLine) as HTMLDivElement;
        this.setAltitude(0);

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

        this.renderBlocks();
    }

    setAltitude(ft: number): void {
        this.aircraftAlt = ft;
        const pct = (ft / MAX_ALT) * 100;
        this.aircraftLine.style.bottom = `${pct}%`;
        this.aircraftLabel.textContent = `${ft.toLocaleString()} ft`;
        this.highlightCurrent();
    }

    clear(): void {
        this.entries = [];
        this.renderBlocks();
    }

    private renderBlocks(): void {
        // remove old blocks
        for (const b of this.blocks) b.remove();
        this.blocks = [];

        const count = this.entries.length;
        if (count === 0) return;

        // each airspace gets an equal-width column
        const colWidth = 100 / count;

        this.entries.forEach((entry, i) => {
            const bottomPct = (entry.lowerFt / MAX_ALT) * 100;
            const topPct = (entry.upperFt / MAX_ALT) * 100;
            const heightPct = topPct - bottomPct;

            const block = L.DomUtil.create('div', 'airspace-block', this.stackArea) as HTMLDivElement;
            block.style.bottom = `${bottomPct}%`;
            block.style.height = `${heightPct}%`;
            block.style.left = `${i * colWidth}%`;
            block.style.width = `${colWidth}%`;
            block.style.backgroundColor = BLOCK_COLORS[i % BLOCK_COLORS.length];
            block.style.borderColor = BLOCK_COLORS[i % BLOCK_COLORS.length].replace('0.35', '0.8');

            const label = L.DomUtil.create('div', 'airspace-block-label', block) as HTMLDivElement;
            label.innerHTML = `<span class="airspace-block-name">${entry.name}</span>`;

            // click popup
            block.addEventListener('click', () => {
                this.showDetail(entry, block);
            });
            block.title = `${entry.name}: ${entry.lowerLabel} – ${entry.upperLabel}`;

            this.blocks.push(block);
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
        super({ position: 'topleft' });
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
        this.slider.max = String(MAX_ALT);
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
}
