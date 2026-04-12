<template>
  <div
    ref="containerRef"
    class="airspace-stack-control"
    :class="{ resizing: isResizing }"
    :style="containerStyle"
  >
    <div class="airspace-stack-header">
      <span>Airspace</span>
      <span class="airspace-stack-alt-label">{{ altitudeLabel }}</span>
    </div>

    <div
      ref="stackAreaRef"
      class="airspace-stack-area"
      :style="stackAreaStyle"
      @click="onAreaClick"
    >
      <div
        v-for="tick in ticks"
        :key="'tick-' + tick.alt"
        class="airspace-stack-tick"
        :style="{ bottom: tick.pct + '%' }"
        :data-label="tick.label"
      />

      <div
        v-for="b in blocks"
        :key="'block-' + b.index"
        class="airspace-block"
        :class="{ 'airspace-block-active': b.active }"
        :style="b.style"
        :title="b.title"
        @click="onBlockClick(b.entry, b.index, $event)"
      >
        <div class="airspace-block-label">
          <span class="airspace-block-name">{{ b.entry.name }}</span>
        </div>
      </div>

      <div
        class="airspace-stack-aircraft"
        :class="{ dragging: altDragging }"
        :style="{ bottom: aircraftPct + '%' }"
        @pointerdown="onAltDragStart"
      >
        <div class="airspace-stack-aircraft-label">{{ altitudeLabel }}</div>
      </div>
    </div>

    <div class="airspace-stack-resize-handle left" @pointerdown="onLeftResizeStart" />
    <div class="airspace-stack-resize-handle top" @pointerdown="onTopResizeStart" />
    <div class="airspace-stack-resize-handle corner" @pointerdown="onCornerResizeStart" />

    <div
      v-if="detailPopup"
      ref="detailPopupRef"
      class="airspace-detail-popup"
      :style="detailPopupStyle"
      @click.stop
    >
      <div class="airspace-detail-close" @click="detailPopup = null">&times;</div>
      <b>{{ detailPopup.entry.name }}</b><br>
      {{ airspaceTypeName(detailPopup.entry.type) }}, {{ icaoClassName(detailPopup.entry.icaoClass) }}<br>
      <template v-if="detailPopup.entry.activity">
        {{ activityName(detailPopup.entry.activity) }}<br>
      </template>
      Lower: {{ detailPopup.entry.lowerLabel }} ({{ detailPopup.entry.lowerFt.toLocaleString() }} ft)<br>
      Upper: {{ detailPopup.entry.upperLabel }} ({{ detailPopup.entry.upperFt.toLocaleString() }} ft)<br>
      Status:
      <span :style="{ color: detailPopup.entry.active ? 'green' : 'grey' }">
        {{ detailPopup.entry.active ? 'ACTIVE' : 'INACTIVE' }}
      </span>
      ({{ detailPopup.entry.activeReason }})
      <template v-if="detailPopup.entry.flags.length"><br>{{ detailPopup.entry.flags.join(', ') }}</template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  type AirspaceEntry,
  activityName,
  airspaceColor,
  airspaceTypeName,
  assignColumns,
  CEIL_STEP,
  computeCeiling,
  computeColumnOrder,
  featuresToEntries,
  hexToRgba,
  icaoClassName,
} from '../airspaceStack'

interface Props {
  features: GeoJSON.Feature[]
  altitude: number
  ceiling?: number
}
const props = withDefaults(defineProps<Props>(), { ceiling: undefined })
const emit = defineEmits<{
  'update:altitude': [value: number]
  'block-click': [payload: { entry: AirspaceEntry; index: number }]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const stackAreaRef = ref<HTMLDivElement | null>(null)
const detailPopupRef = ref<HTMLDivElement | null>(null)

const entries = computed(() => featuresToEntries(props.features))
const derivedCeiling = computed(() => computeCeiling(entries.value))
const effectiveCeiling = computed(() => props.ceiling ?? derivedCeiling.value)
const columnOf = computed(() => assignColumns(entries.value))
const numCols = computed(() => Math.max(1, new Set(columnOf.value).size))
const colOrder = computed(() =>
  computeColumnOrder(entries.value, columnOf.value, numCols.value, props.altitude),
)

const altitudeLabel = computed(() => `${props.altitude.toLocaleString()} ft`)
const aircraftPct = computed(() =>
  effectiveCeiling.value > 0 ? (props.altitude / effectiveCeiling.value) * 100 : 0,
)

const ticks = computed(() => {
  const list: { alt: number; pct: number; label: string }[] = []
  for (let alt = 0; alt <= effectiveCeiling.value; alt += CEIL_STEP) {
    list.push({
      alt,
      pct: (alt / effectiveCeiling.value) * 100,
      label: alt >= 10_000 ? `${alt / 1000}k` : `${alt}`,
    })
  }
  return list
})

interface BlockView {
  index: number
  entry: AirspaceEntry
  active: boolean
  style: Record<string, string>
  title: string
}

const blocks = computed<BlockView[]>(() => {
  if (entries.value.length === 0) return []
  const colWidth = 100 / numCols.value
  return entries.value.map((entry, i) => {
    const bottomPct = (entry.lowerFt / effectiveCeiling.value) * 100
    const topPct = (entry.upperFt / effectiveCeiling.value) * 100
    const heightPct = topPct - bottomPct
    const displayCol = colOrder.value[columnOf.value[i]]
    const active = props.altitude >= entry.lowerFt && props.altitude < entry.upperFt
    const hex = airspaceColor(entry)
    return {
      index: i,
      entry,
      active,
      style: {
        bottom: `${bottomPct}%`,
        height: `${heightPct}%`,
        left: `${displayCol * colWidth}%`,
        width: `${colWidth}%`,
        backgroundColor: hexToRgba(hex, active ? 0.7 : 0.35),
        borderColor: hexToRgba(hex, 0.8),
      },
      title: `${entry.name}: ${entry.lowerLabel} – ${entry.upperLabel}`,
    }
  })
})

const STORAGE_KEY = 'airspace-stack-size'

function loadStoredSize(): { width: number | null; height: number | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { width: null, height: null }
    const parsed = JSON.parse(raw)
    return {
      width: typeof parsed.width === 'number' ? parsed.width : null,
      height: typeof parsed.height === 'number' ? parsed.height : null,
    }
  } catch {
    return { width: null, height: null }
  }
}

function saveStoredSize(width: number | null, height: number | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, height }))
  } catch { /* quota exceeded or private browsing */ }
}

const stored = loadStoredSize()
const manualWidthPx = ref<number | null>(stored.width)
const manualHeightPx = ref<number | null>(stored.height)
const windowWidth = ref(typeof window === 'undefined' ? 1024 : window.innerWidth)
const isResizing = ref(false)
const autoWidthTrigger = ref(0)

function getMinWidthPx(): number {
  if (!containerRef.value) return 100
  return parseFloat(getComputedStyle(containerRef.value).minWidth) || 100
}

function getCssVarPx(name: string, fallback: number): number {
  if (!containerRef.value) return fallback
  return parseFloat(getComputedStyle(containerRef.value).getPropertyValue(name)) || fallback
}

function getAvailableWidthPx(): number {
  if (!containerRef.value) return window.innerWidth
  const rect = containerRef.value.getBoundingClientRect()
  const margin = getCssVarPx('--airspace-stack-viewport-margin', 8)
  return Math.max(getMinWidthPx(), rect.right - margin)
}

function clampWidthPx(widthPx: number): number {
  return Math.max(getMinWidthPx(), Math.min(widthPx, getAvailableWidthPx()))
}

function computeAutoWidthPx(): number {
  const colVw = getCssVarPx('--airspace-stack-column-width-vw', 5)
  return (windowWidth.value * colVw * numCols.value) / 100
}

const containerStyle = computed(() => {
  void autoWidthTrigger.value
  void windowWidth.value
  void numCols.value
  const style: Record<string, string> = {}
  if (containerRef.value) {
    const desired = manualWidthPx.value ?? computeAutoWidthPx()
    style.width = `${Math.round(clampWidthPx(desired))}px`
  }
  if (manualHeightPx.value != null) {
    style.height = `${manualHeightPx.value}px`
  }
  return style
})

const stackAreaStyle = computed(() => {
  if (manualHeightPx.value == null) return {}
  return { height: `${manualHeightPx.value - 35}px` }
})

function onWindowResize() {
  windowWidth.value = window.innerWidth
}

// Altitude drag
const altDragging = ref(false)
function onAltDragStart(e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  altDragging.value = true
  window.addEventListener('pointermove', onAltDragMove)
  window.addEventListener('pointerup', onAltDragEnd)
}
function onAltDragMove(e: PointerEvent) {
  if (!stackAreaRef.value) return
  const rect = stackAreaRef.value.getBoundingClientRect()
  const ratio = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
  const value = Math.max(
    0,
    Math.min(effectiveCeiling.value, Math.round((ratio * effectiveCeiling.value) / 100) * 100),
  )
  emit('update:altitude', value)
}
function onAltDragEnd() {
  altDragging.value = false
  window.removeEventListener('pointermove', onAltDragMove)
  window.removeEventListener('pointerup', onAltDragEnd)
}

// Left resize
function onLeftResizeStart(e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  window.addEventListener('pointermove', onLeftResizeMove)
  window.addEventListener('pointerup', onLeftResizeEnd)
}
function onLeftResizeMove(e: PointerEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  manualWidthPx.value = Math.max(getMinWidthPx(), rect.right - e.clientX)
}
function onLeftResizeEnd() {
  isResizing.value = false
  window.removeEventListener('pointermove', onLeftResizeMove)
  window.removeEventListener('pointerup', onLeftResizeEnd)
  saveStoredSize(manualWidthPx.value, manualHeightPx.value)
}

// Top resize
function onTopResizeStart(e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  window.addEventListener('pointermove', onTopResizeMove)
  window.addEventListener('pointerup', onTopResizeEnd)
}
function onTopResizeMove(e: PointerEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  manualHeightPx.value = Math.max(100, rect.bottom - e.clientY)
}
function onTopResizeEnd() {
  isResizing.value = false
  window.removeEventListener('pointermove', onTopResizeMove)
  window.removeEventListener('pointerup', onTopResizeEnd)
  saveStoredSize(manualWidthPx.value, manualHeightPx.value)
}

// Corner resize (width + height)
function onCornerResizeStart(e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  window.addEventListener('pointermove', onCornerResizeMove)
  window.addEventListener('pointerup', onCornerResizeEnd)
}
function onCornerResizeMove(e: PointerEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  manualWidthPx.value = Math.max(getMinWidthPx(), rect.right - e.clientX)
  manualHeightPx.value = Math.max(100, rect.bottom - e.clientY)
}
function onCornerResizeEnd() {
  isResizing.value = false
  window.removeEventListener('pointermove', onCornerResizeMove)
  window.removeEventListener('pointerup', onCornerResizeEnd)
  saveStoredSize(manualWidthPx.value, manualHeightPx.value)
}

// Block click -> detail popup
interface DetailPopupState {
  entry: AirspaceEntry
  index: number
  x: number
  y: number
  placed: boolean
}
const detailPopup = ref<DetailPopupState | null>(null)
const detailPopupStyle = computed(() => {
  if (!detailPopup.value) return {}
  return {
    position: 'fixed' as const,
    left: `${detailPopup.value.x}px`,
    top: `${detailPopup.value.y}px`,
    pointerEvents: 'auto' as const,
    visibility: detailPopup.value.placed ? ('visible' as const) : ('hidden' as const),
  }
})

async function onBlockClick(entry: AirspaceEntry, index: number, e: MouseEvent) {
  e.stopPropagation()
  const clickX = e.clientX
  const clickY = e.clientY
  detailPopup.value = {
    entry,
    index,
    x: clickX,
    y: clickY,
    placed: false,
  }
  emit('block-click', { entry, index })
  await nextTick()
  if (!detailPopupRef.value || !detailPopup.value) return
  const rect = detailPopupRef.value.getBoundingClientRect()
  const margin = 8
  const x = Math.max(
    margin,
    Math.min(clickX - rect.width / 2, window.innerWidth - rect.width - margin),
  )
  const y = Math.max(
    margin,
    Math.min(clickY - rect.height / 2, window.innerHeight - rect.height - margin),
  )
  detailPopup.value = { entry, index, x, y, placed: true }
}

function onAreaClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!stackAreaRef.value) return
  if (
    target === stackAreaRef.value ||
    target.classList.contains('airspace-stack-aircraft') ||
    target.classList.contains('airspace-stack-aircraft-label') ||
    target.classList.contains('airspace-stack-tick')
  ) {
    detailPopup.value = null
  }
}

function preventTouchMove(e: TouchEvent) {
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
  containerRef.value?.addEventListener('touchmove', preventTouchMove, { passive: false })
  // Force the initial width computation now that the ref is bound
  autoWidthTrigger.value++
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  containerRef.value?.removeEventListener('touchmove', preventTouchMove)
  window.removeEventListener('pointermove', onAltDragMove)
  window.removeEventListener('pointerup', onAltDragEnd)
  window.removeEventListener('pointermove', onLeftResizeMove)
  window.removeEventListener('pointerup', onLeftResizeEnd)
  window.removeEventListener('pointermove', onTopResizeMove)
  window.removeEventListener('pointerup', onTopResizeEnd)
  window.removeEventListener('pointermove', onCornerResizeMove)
  window.removeEventListener('pointerup', onCornerResizeEnd)
})
</script>
