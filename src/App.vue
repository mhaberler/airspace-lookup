<template>
  <div class="app-root flex flex-col">
    <TitleBar
      v-model:mode="state.mode"
      v-model:follow="state.follow"
      v-model:showAirspace="state.showAirspace"
      v-model:showStack="state.showStack"
      v-model:showAirports="state.showAirports"
    />
    <div class="flex-1 relative">
      <AirspaceMap
        ref="mapRef"
        :mode="state.mode"
        :altitude="state.altitude"
        :follow="state.follow"
        :show-airspace="state.showAirspace"
        :show-stack="state.showStack"
        :show-airports="state.showAirports"
        :home="true"
        :link="true"
        github="https://github.com/mhaberler/airspace-lookup"
        :initial-center="initialCenter"
        :initial-zoom="initialZoom"
        :initial-base-layer="initialBaseLayer"
        :initial-overlays="initialOverlays"
        @update:mode="state.mode = $event"
        @update:altitude="state.altitude = $event"
        @update:viewport="onViewport"
        @update:position="onPosition"
        @update:base-layer="onBaseLayer"
        @update:overlays="onOverlays"
        @error="showToast"
      />
      <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, nextTick, reactive, ref, watch } from 'vue'
import TitleBar from './components/TitleBar.vue'
import AirspaceMap from './components/AirspaceMap.vue'
import { useServiceWorker } from './composables/useServiceWorker'

useServiceWorker()

// ── URL param parsing ──────────────────────────────────────────────────────
const params = new URLSearchParams(location.search)
const initialLat = parseFloat(params.get('lat') ?? '')
const initialLng = parseFloat(params.get('lng') ?? '')
const initialCenter: [number, number] = !isNaN(initialLat) && !isNaN(initialLng)
  ? [initialLat, initialLng]
  : [47, 15]
const initialZoom = parseInt(params.get('z') ?? '12', 10)
const initialAlt = parseInt(params.get('alt') ?? '', 10)
const initialBaseLayer = params.get('base') ?? 'osm'
const initialOverlays = params.get('overlays')?.split(',').filter(Boolean) ?? ['openaip']

const urlMode = params.get('mode')
const urlFollow = params.get('follow')
const urlShow = params.get('show')

// ── Reactive state ─────────────────────────────────────────────────────────
const state = reactive({
  mode: (urlMode === 'track' || urlMode === 'what-if' ? urlMode : 'what-if') as 'track' | 'what-if',
  follow: urlFollow !== null ? urlFollow === '1' : true,
  showAirspace: true,
  showStack: true,
  showAirports: true,
  altitude: !isNaN(initialAlt) && initialAlt > 0 ? initialAlt : 0,
})

if (urlShow !== null) {
  const keys = new Set(urlShow.split(',').filter(Boolean))
  state.showAirspace = keys.has('airspace')
  state.showStack = keys.has('stack')
  state.showAirports = keys.has('airports')
}

// Viewport state (driven by map events)
const viewport = reactive({
  lat: initialCenter[0],
  lng: initialCenter[1],
  zoom: initialZoom,
  baseLayer: initialBaseLayer,
  overlays: [...initialOverlays],
})

const mapRef = ref<InstanceType<typeof AirspaceMap> | null>(null)

// ── Toast ──────────────────────────────────────────────────────────────────
const toastMsg = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string): void {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = null }, 4000)
}

// ── URL sync ───────────────────────────────────────────────────────────────
function updateUrl(): void {
  const p = new URLSearchParams()
  p.set('lat', viewport.lat.toFixed(6))
  p.set('lng', viewport.lng.toFixed(6))
  p.set('z', String(viewport.zoom))
  if (state.altitude > 0) p.set('alt', String(state.altitude))
  if (viewport.baseLayer !== 'osm') p.set('base', viewport.baseLayer)
  if (viewport.overlays.length) p.set('overlays', viewport.overlays.join(','))
  if (state.mode !== 'what-if') p.set('mode', state.mode)
  if (state.follow) p.set('follow', '1')
  const show: string[] = []
  if (state.showAirspace) show.push('airspace')
  if (state.showStack) show.push('stack')
  if (state.showAirports) show.push('airports')
  if (show.length < 3) p.set('show', show.join(','))
  history.replaceState(null, '', `${location.pathname}?${p}`)
}

function onViewport(v: { lat: number; lng: number; zoom: number }): void {
  viewport.lat = v.lat
  viewport.lng = v.lng
  viewport.zoom = v.zoom
  updateUrl()
}

function onPosition(pos: { lat: number; lng: number }): void {
  viewport.lat = pos.lat
  viewport.lng = pos.lng
  updateUrl()
}

function onBaseLayer(key: string): void {
  viewport.baseLayer = key
  updateUrl()
}

function onOverlays(keys: string[]): void {
  viewport.overlays = keys
  updateUrl()
}

watch(state, () => updateUrl(), { deep: true })

// ── Initial URL-based click ────────────────────────────────────────────────
onMounted(async () => {
  if (!isNaN(initialLat) && !isNaN(initialLng) && state.mode === 'what-if') {
    await nextTick()
    mapRef.value?.triggerClickAt({ lat: initialLat, lng: initialLng })
  }
})
</script>
