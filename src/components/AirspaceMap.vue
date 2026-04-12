<template>
  <div class="airspace-map-root">
    <div ref="mapContainerRef" class="airspace-map-container"></div>
    <Teleport v-if="stackTarget" :to="stackTarget">
      <AirspaceStack
        :features="stackFeatures"
        :altitude="altitude"
        @update:altitude="onAltitudeEmit"
        @block-click="onStackBlockClick"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import L from 'leaflet'
import { airportPopupHtml, airportTypeName } from '../markerCallback'
import {
  type AirspaceEntry,
  icaoClassName,
  airspaceTypeName,
  activityName,
  airspaceColor,
} from '../airspaceStack'
import AirspaceStack from './AirspaceStack.vue'
import { useOpenAIP } from '../composables/useOpenAIP'

interface Props {
  mode: 'track' | 'what-if'
  altitude: number
  follow: boolean
  showAirspace: boolean
  showStack: boolean
  showAirports: boolean
  home?: boolean
  link?: boolean
  github?: string | false
  initialCenter?: [number, number]
  initialZoom?: number
  initialBaseLayer?: string
  initialOverlays?: string[]
}
const props = withDefaults(defineProps<Props>(), {
  home: true,
  link: true,
  github: false,
  initialCenter: () => [47, 15],
  initialZoom: 12,
  initialBaseLayer: 'osm',
  initialOverlays: () => ['openaip'],
})

const emit = defineEmits<{
  'update:mode': [mode: 'track' | 'what-if']
  'update:altitude': [altitude: number]
  'update:viewport': [viewport: { lat: number; lng: number; zoom: number }]
  'update:position': [pos: { lat: number; lng: number }]
  'update:baseLayer': [key: string]
  'update:overlays': [keys: string[]]
  error: [message: string]
}>()

const mapContainerRef = ref<HTMLDivElement | null>(null)
const stackTarget = ref<HTMLElement | null>(null)
const stackFeatures = shallowRef<GeoJSON.Feature[]>([])

const openAIP = useOpenAIP()

let map: L.Map
let currentMarker: L.Marker | null = null
let currentGeojsonLayer: L.GeoJSON | null = null
let lastGeojsonFeatures: GeoJSON.FeatureCollection | null = null
let highlightedLayer: L.Path | null = null
const airportMarkerById = new Map<string, L.CircleMarker>()
let stackHostControl: L.Control | null = null
let stackAttached = true
let baseLayers: Record<string, L.TileLayer> = {}
let overlayLayers: Record<string, L.TileLayer> = {}

let watchId: number | null = null
let trackMarker: L.CircleMarker | null = null
let accuracyCircle: L.Circle | null = null
let firstFix = true

const AIRPORT_DEBUG = import.meta.env.DEV && new URLSearchParams(location.search).get('debugAirports') === '1'
function logAirportRefresh(event: string, details: Record<string, unknown>): void {
  if (!AIRPORT_DEBUG) return
  console.debug(`[airports] ${event}`, details)
}

const AIRPORT_ICON_COLOR: Record<number, string> = {
  3: '#1565C0',
  5: '#6A1B9A',
  4: '#00838F',
  7: '#00838F',
}
function airportColor(type: number): string {
  return AIRPORT_ICON_COLOR[type] ?? '#2E7D32'
}

function featureStyle(fprops: GeoJSON.GeoJsonProperties): L.PathOptions {
  const active = fprops?.active ?? true
  const hex = airspaceColor({
    type: fprops?.type ?? 0,
    icaoClass: fprops?.icaoClass ?? 7,
    activity: fprops?.activity ?? 0,
  })
  return {
    color: active ? hex : '#888888',
    weight: 2,
    fillOpacity: active ? 0.2 : 0.08,
    dashArray: active ? undefined : '5, 5',
  }
}

function resetHighlight(): void {
  if (highlightedLayer) {
    const feature = (highlightedLayer as unknown as { feature?: GeoJSON.Feature }).feature
    highlightedLayer.setStyle(featureStyle(feature?.properties ?? null))
    highlightedLayer = null
  }
}

function highlightAirspaceOnMap(entry: AirspaceEntry): void {
  resetHighlight()
  if (!currentGeojsonLayer) return
  currentGeojsonLayer.eachLayer((layer) => {
    const feature = (layer as unknown as { feature?: GeoJSON.Feature }).feature
    if (!feature) return
    const fprops = feature.properties
    if (fprops?.name === entry.name && fprops?.lowerFt === entry.lowerFt && fprops?.upperFt === entry.upperFt) {
      const path = layer as L.Path
      path.setStyle({
        color: '#f1c40f',
        weight: 4,
        fillOpacity: 0.35,
      })
      path.bringToFront()
      highlightedLayer = path
    }
  })
}

function onStackBlockClick(payload: { entry: AirspaceEntry; index: number }): void {
  highlightAirspaceOnMap(payload.entry)
}
function onAltitudeEmit(ft: number): void {
  emit('update:altitude', ft)
}

function renderGeojson(geojson: GeoJSON.FeatureCollection | null): void {
  resetHighlight()
  if (currentGeojsonLayer) {
    currentGeojsonLayer.remove()
    currentGeojsonLayer = null
  }
  lastGeojsonFeatures = geojson

  if (geojson && props.showAirspace) {
    currentGeojsonLayer = L.geoJSON(geojson, {
      style: (feature) => featureStyle(feature?.properties ?? null),
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name ?? 'Airspace'
        const lower = feature.properties?.lowerLabel ?? '?'
        const upper = feature.properties?.upperLabel ?? '?'
        const active = feature.properties?.active ?? true
        const reason = feature.properties?.activeReason ?? '24h'
        const status = active
          ? `<span style="color:green">ACTIVE</span> (${reason})`
          : `<span style="color:grey">INACTIVE</span> (${reason})`
        const cls = icaoClassName(feature.properties?.icaoClass ?? 7)
        const typ = airspaceTypeName(feature.properties?.type ?? 0)
        const act = feature.properties?.activity ? ` – ${activityName(feature.properties.activity)}` : ''
        const flags: string[] = feature.properties?.flags ?? []
        const flagsHtml = flags.length ? `<br>${flags.join(', ')}` : ''
        layer.bindPopup(`<b>${name}</b> (${typ}, ${cls}${act})<br>${lower} – ${upper}<br>${status}${flagsHtml}`)
      },
    }).addTo(map)
  }

  if (props.showStack) {
    stackFeatures.value = geojson ? geojson.features : []
  }

  for (const marker of airportMarkerById.values()) marker.bringToFront()
}

async function onMapClick(e: L.LeafletMouseEvent): Promise<void> {
  if (props.mode !== 'what-if') return
  const { lat, lng } = e.latlng

  if (currentMarker) {
    currentMarker.setLatLng(e.latlng)
  } else {
    currentMarker = L.marker(e.latlng).addTo(map)
  }

  emit('update:position', { lat, lng })

  if (props.showAirspace || props.showStack) {
    const { popupText, geojson } = await openAIP.fetchAirspaceAt(lat, lng)
    if (props.showAirspace) {
      currentMarker.bindPopup(popupText).openPopup()
    } else {
      currentMarker.closePopup().unbindPopup()
    }
    renderGeojson(geojson)
  } else {
    currentMarker.closePopup().unbindPopup()
    renderGeojson(null)
  }
}

function clearAll(): void {
  if (currentMarker) {
    currentMarker.remove()
    currentMarker = null
  }
  resetHighlight()
  if (currentGeojsonLayer) {
    currentGeojsonLayer.remove()
    currentGeojsonLayer = null
  }
  lastGeojsonFeatures = null
  stackFeatures.value = []
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null

async function refreshAirports(targetCenter?: L.LatLngExpression): Promise<void> {
  if (!props.showAirports) return
  const center = targetCenter ? L.latLng(targetCenter) : map.getCenter()

  logAirportRefresh('refresh-request', { center: center.toString() })
  await openAIP.refetchAirportsIfNeeded(
    { lat: center.lat, lng: center.lng },
    (airports) => {
      let added = 0
      let updated = 0
      for (const airport of airports) {
        const [lngA, latA] = airport.geometry.coordinates
        const color = airportColor(airport.type)
        const existing = airportMarkerById.get(airport._id)
        if (existing) {
          existing.setLatLng([latA, lngA])
          existing.setStyle({
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.55,
          })
          existing.setRadius(7)
          existing.bindPopup(airportPopupHtml(airport), { maxWidth: 320 })
          existing.bindTooltip(
            `${airport.icaoCode ? airport.icaoCode + ' · ' : ''}${airport.name} (${airportTypeName(airport.type)})`,
            { sticky: true },
          )
          updated += 1
          continue
        }
        const marker = L.circleMarker([latA, lngA], {
          radius: 7,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.55,
        })
        marker.bindPopup(airportPopupHtml(airport), { maxWidth: 320 })
        marker.bindTooltip(
          `${airport.icaoCode ? airport.icaoCode + ' · ' : ''}${airport.name} (${airportTypeName(airport.type)})`,
          { sticky: true },
        )
        marker.addTo(map)
        airportMarkerById.set(airport._id, marker)
        added += 1
      }
      for (const marker of airportMarkerById.values()) marker.bringToFront()
      logAirportRefresh('fetch-done', {
        fetched: airports.length,
        added,
        updated,
        retained: airportMarkerById.size,
        center: center.toString(),
      })
    },
  )
}

function scheduleRefreshAirports(): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshAirports()
  }, 500)
}

async function loadAirspaceAt(latlng: L.LatLng): Promise<void> {
  const { geojson } = await openAIP.fetchAirspaceAt(latlng.lat, latlng.lng)
  renderGeojson(geojson)
}

function onFix(pos: GeolocationPosition): void {
  const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude)
  const accuracy = pos.coords.accuracy

  if (!trackMarker) {
    trackMarker = L.circleMarker(latlng, {
      radius: 8,
      color: '#ffffff',
      weight: 2,
      fillColor: '#1a73e8',
      fillOpacity: 1,
    }).addTo(map)
    accuracyCircle = L.circle(latlng, {
      radius: accuracy,
      color: '#1a73e8',
      weight: 1,
      fillColor: '#1a73e8',
      fillOpacity: 0.1,
    }).addTo(map)
  } else {
    trackMarker.setLatLng(latlng)
    accuracyCircle?.setLatLng(latlng)
    accuracyCircle?.setRadius(accuracy)
  }

  if (firstFix) {
    map.setView(latlng, map.getZoom())
    firstFix = false
  } else if (props.follow && !map.getBounds().contains(latlng)) {
    map.panTo(latlng)
  }

  emit('update:position', { lat: latlng.lat, lng: latlng.lng })

  if (pos.coords.altitude != null && props.showStack) {
    emit('update:altitude', Math.round(pos.coords.altitude * 3.28084))
  }

  if (props.showAirspace || props.showStack) {
    if (openAIP.needsAirspaceRefetch({ lat: latlng.lat, lng: latlng.lng })) {
      void loadAirspaceAt(latlng)
    }
  }

  if (props.showAirports) void refreshAirports(latlng)
}

function onGeoError(err: GeolocationPositionError): void {
  console.warn('Geolocation error:', err.message)
  emit('error', `Location unavailable: ${err.message}`)
  emit('update:mode', 'what-if')
}

function startTracking(): void {
  if (watchId !== null) return
  firstFix = true
  openAIP.resetAirspaceCenter()
  if (currentMarker) {
    currentMarker.closePopup()
    currentMarker.remove()
    currentMarker = null
  }
  watchId = navigator.geolocation.watchPosition(onFix, onGeoError, {
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 1_000,
  })
}

function stopTracking(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  trackMarker?.remove()
  trackMarker = null
  accuracyCircle?.remove()
  accuracyCircle = null
  openAIP.resetAirspaceCenter()
  firstFix = true
}

function applyShowAirspace(): void {
  if (props.showAirspace) {
    if (lastGeojsonFeatures) {
      renderGeojson(lastGeojsonFeatures)
    } else {
      const anchor =
        props.mode === 'track' && trackMarker
          ? trackMarker.getLatLng()
          : currentMarker
            ? currentMarker.getLatLng()
            : null
      if (anchor) void loadAirspaceAt(anchor)
    }
  } else {
    if (currentGeojsonLayer) {
      currentGeojsonLayer.remove()
      currentGeojsonLayer = null
    }
    resetHighlight()
  }
}

function applyShowStack(): void {
  if (!stackHostControl) return
  if (props.showStack && !stackAttached) {
    stackHostControl.addTo(map)
    stackAttached = true
    if (lastGeojsonFeatures) {
      stackFeatures.value = lastGeojsonFeatures.features
    } else {
      const anchor =
        props.mode === 'track' && trackMarker
          ? trackMarker.getLatLng()
          : currentMarker
            ? currentMarker.getLatLng()
            : null
      if (anchor) void loadAirspaceAt(anchor)
    }
  } else if (!props.showStack && stackAttached) {
    stackAttached = false
    stackHostControl.remove()
  }
}

function applyShowAirports(): void {
  if (props.showAirports) {
    for (const marker of airportMarkerById.values()) marker.addTo(map)
    openAIP.resetAirportCenter()
    const center = props.mode === 'track' && trackMarker
      ? trackMarker.getLatLng()
      : map.getCenter()
    void refreshAirports(center)
  } else {
    for (const marker of airportMarkerById.values()) marker.remove()
    openAIP.resetAirportCenter()
  }
}

function shouldIgnoreMapClick(e: L.LeafletMouseEvent): boolean {
  const target = (e.originalEvent?.target as HTMLElement | null) ?? null
  if (!target) return false
  return Boolean(target.closest('.leaflet-popup, .airspace-stack-control, .airspace-detail-popup'))
}

function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false)
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return Promise.resolve(ok)
  } catch {
    return Promise.resolve(false)
  }
}

function triggerClickAt(latlng: { lat: number; lng: number }): void {
  if (!map) return
  map.fireEvent('click', { latlng: L.latLng(latlng.lat, latlng.lng) } as L.LeafletMouseEvent)
}

defineExpose({ triggerClickAt })

onMounted(() => {
  L.Icon.Default.imagePath = 'img/icon/'

  const openFlightMapsOverlay = {
    name: 'OpenFlightMaps',
    url: 'https://nwy-tiles-api.prod.newaydata.com/tiles/{z}/{x}/{y}.png?path=latest/aero/latest',
    attr: '(c) <a href="https://openflightmaps.org/" target="_blank" rel="noopener noreferrer">Open Flightmaps association</a>, (c) OpenStreetMap contributors, NASA elevation data',
    maxZoom: 16,
    opacity: 0.9,
    zIndex: 2,
  } as const

  const m_mono = L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  })
  const m_topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenTopoMap contributors',
    maxZoom: 17,
  })
  const m_ortho = L.tileLayer('https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg', {
    attribution: '&copy; basemap.at',
    maxZoom: 18,
  })
  const openFlightMapsLayer = L.tileLayer(openFlightMapsOverlay.url, {
    attribution: openFlightMapsOverlay.attr,
    maxZoom: openFlightMapsOverlay.maxZoom,
    opacity: openFlightMapsOverlay.opacity,
    zIndex: openFlightMapsOverlay.zIndex,
  })
  const openAipLayer = L.tileLayer(
    `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(import.meta.env.VITE_OPENAIP_KEY as string)}`,
    {
      attribution: '&copy; <a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer">openAIP</a>',
      maxZoom: 14,
      opacity: 0.8,
      zIndex: 4,
    },
  )

  baseLayers = { osm: m_mono, topo: m_topo, ortho: m_ortho }
  overlayLayers = { ofm: openFlightMapsLayer, openaip: openAipLayer }

  const initialBase = baseLayers[props.initialBaseLayer] ?? m_mono
  const initialOverlayLayers = (props.initialOverlays ?? [])
    .map((k) => overlayLayers[k])
    .filter((l): l is L.TileLayer => Boolean(l))

  map = L.map(mapContainerRef.value!, {
    center: props.initialCenter,
    zoom: props.initialZoom,
    zoomControl: true,
    layers: [initialBase, ...initialOverlayLayers],
  })

  L.control.layers(
    {
      OpenStreetMap: m_mono,
      OpenTopoMap: m_topo,
      'Austria Orthophoto': m_ortho,
    },
    {
      [openFlightMapsOverlay.name]: openFlightMapsLayer,
      openAIP: openAipLayer,
    },
  ).addTo(map)

  L.control.scale({ imperial: false, maxWidth: 300 }).addTo(map)

  if (props.home) {
    const HomeControl = L.Control.extend({
      options: { position: 'topleft' as L.ControlPosition },
      onAdd(_map: L.Map) {
        const btn = L.DomUtil.create('div', 'leaflet-bar home-control') as HTMLDivElement
        const a = L.DomUtil.create('a', '', btn) as HTMLAnchorElement
        a.href = '#'
        a.title = 'Go to my location'
        a.innerHTML = '&#x2302;'
        a.role = 'button'
        L.DomEvent.disableClickPropagation(btn)
        L.DomEvent.on(a, 'click', (e) => {
          L.DomEvent.preventDefault(e)
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude)
              _map.setView(latlng, 12)
              _map.fireEvent('click', { latlng } as L.LeafletMouseEvent)
              emit(
                'update:altitude',
                pos.coords.altitude != null ? Math.round(pos.coords.altitude * 3.28084) : 0,
              )
            },
            (err) => console.warn('Geolocation error:', err.message),
            { enableHighAccuracy: true, timeout: 10_000 },
          )
        })
        return btn
      },
    })
    new HomeControl().addTo(map)
  }

  if (props.link) {
    const ShareControl = L.Control.extend({
      options: { position: 'topleft' as L.ControlPosition },
      onAdd(_map: L.Map) {
        const btn = L.DomUtil.create('div', 'leaflet-bar share-control') as HTMLDivElement
        const a = L.DomUtil.create('a', '', btn) as HTMLAnchorElement
        a.href = '#'
        a.title = 'Copy link to this location'
        a.innerHTML = '&#x1F517;'
        a.role = 'button'
        L.DomEvent.disableClickPropagation(btn)
        L.DomEvent.on(a, 'click', (e) => {
          L.DomEvent.preventDefault(e)
          const pos = currentMarker ? currentMarker.getLatLng() : _map.getCenter()
          const z = _map.getZoom()
          const alt = props.altitude
          const url = `${location.origin}${location.pathname}?lat=${pos.lat.toFixed(6)}&lng=${pos.lng.toFixed(6)}&z=${z}&alt=${alt}`
          copyText(url).then((ok) => {
            if (!ok) {
              console.warn('Copy failed: Clipboard API unavailable in this context')
              return
            }
            btn.classList.add('copied')
            a.innerHTML = '&#x2713;'
            setTimeout(() => {
              btn.classList.remove('copied')
              a.innerHTML = '&#x1F517;'
            }, 2000)
          })
        })
        return btn
      },
    })
    new ShareControl().addTo(map)
  }

  if (props.github) {
    const githubUrl = props.github
    const GitHubControl = L.Control.extend({
      options: { position: 'topleft' as L.ControlPosition },
      onAdd(_map: L.Map) {
        const btn = L.DomUtil.create('div', 'leaflet-bar github-control') as HTMLDivElement
        const a = L.DomUtil.create('a', '', btn) as HTMLAnchorElement
        a.href = githubUrl
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.title = 'View on GitHub'
        a.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>'
        a.role = 'button'
        L.DomEvent.disableClickPropagation(btn)
        return btn
      },
    })
    new GitHubControl().addTo(map)
  }

  const StackHostControl = L.Control.extend({
    options: { position: 'bottomright' as L.ControlPosition },
    onAdd() {
      const div = L.DomUtil.create('div', 'airspace-stack-host') as HTMLDivElement
      L.DomEvent.disableClickPropagation(div)
      L.DomEvent.disableScrollPropagation(div)
      stackTarget.value = div
      return div
    },
    onRemove() {
      stackTarget.value = null
    },
  })
  stackHostControl = new StackHostControl()
  stackHostControl.addTo(map)

  map.on('click', (e: L.LeafletMouseEvent) => {
    if (shouldIgnoreMapClick(e)) return
    onMapClick(e)
    logAirportRefresh('trigger-click', { center: e.latlng.toString() })
    void refreshAirports(e.latlng)
  })
  map.on('contextmenu', () => clearAll())
  map.on('moveend', () => {
    const pos = currentMarker
      ? currentMarker.getLatLng()
      : trackMarker
        ? trackMarker.getLatLng()
        : map.getCenter()
    emit('update:viewport', { lat: pos.lat, lng: pos.lng, zoom: map.getZoom() })
    scheduleRefreshAirports()
  })
  map.on('baselayerchange', () => {
    const key = Object.entries(baseLayers).find(([, layer]) => map.hasLayer(layer))?.[0]
    if (key) emit('update:baseLayer', key)
  })
  const emitOverlays = () => {
    const keys = Object.entries(overlayLayers)
      .filter(([, layer]) => map.hasLayer(layer))
      .map(([k]) => k)
    emit('update:overlays', keys)
  }
  map.on('overlayadd', emitOverlays)
  map.on('overlayremove', emitOverlays)

  if (!props.showStack) {
    stackHostControl.remove()
    stackAttached = false
  }

  if (props.mode === 'track') startTracking()

  refreshAirports()
})

onBeforeUnmount(() => {
  stopTracking()
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (map) map.remove()
})

watch(() => props.mode, (newMode) => {
  if (newMode === 'track') startTracking()
  else stopTracking()
})
watch(() => props.showAirspace, () => applyShowAirspace())
watch(() => props.showStack, () => applyShowStack())
watch(() => props.showAirports, () => applyShowAirports())
</script>

<style scoped>
.airspace-map-root {
  position: relative;
  width: 100%;
  height: 100%;
}
.airspace-map-container {
  position: absolute;
  inset: 0;
}
</style>
