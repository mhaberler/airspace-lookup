<template>
  <div id="app" class="h-screen">
    <div id="map" class="h-full w-full"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import L from 'leaflet'
import { MarkerCallback, markerCallback, fetchAirports, airportPopupHtml, airportTypeName } from './markerCallback'
import { AirspaceStackControl, AirspaceEntry, icaoClassName, airspaceTypeName, activityName, airspaceColor } from './airspaceStack'

onMounted(() => {
  L.Icon.Default.imagePath = 'img/icon/'

  const openFlightMapsOverlay = {
    key: 'openflightmaps-overlay',
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

  const skywaysLayer = L.tileLayer('https://thermal.kk7.ch/tiles/skyways_all_all/{z}/{x}/{y}.png?src=mah.priv.at', {
    attribution: '<a href="https://thermal.kk7.ch/" target="_blank">thermal.kk7.ch</a> <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank">CC-BY-NC-SA</a>',
    maxNativeZoom: 13,
    maxZoom: 18,
    tms: true,
    zIndex: 3,
  })

  const thermalsLayer = L.tileLayer('https://thermal.kk7.ch/tiles/thermals_jul_07/{z}/{x}/{y}.png?src=mah.priv.at', {
    attribution: '<a href="https://thermal.kk7.ch/" target="_blank">thermal.kk7.ch</a> <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank">CC-BY-NC-SA</a>',
    maxNativeZoom: 12,
    maxZoom: 18,
    tms: true,
    zIndex: 4,
  })

  const baseLayers: Record<string, L.TileLayer> = {
    osm: m_mono,
    topo: m_topo,
    ortho: m_ortho,
  }
  const overlayLayers: Record<string, L.TileLayer> = {
    ofm: openFlightMapsLayer,
    skyways: skywaysLayer,
    thermals: thermalsLayer,
  }

  const map = L.map('map', {
    center: [47, 15],
    zoom: 12,
    zoomControl: true,
    layers: [m_mono],
  })

  L.control.layers(
    {
      OpenStreetMap: m_mono,
      OpenTopoMap: m_topo,
      'Austria Orthophoto': m_ortho,
    },
    {
      [openFlightMapsOverlay.name]: openFlightMapsLayer,
      Skyways: skywaysLayer,
      'Thermals Jul 07': thermalsLayer,
    },
  ).addTo(map)

  L.control.scale({
    imperial: false,
    maxWidth: 300,
  }).addTo(map)

  let currentMarker: L.Marker | null = null
  let currentGeojsonLayer: L.GeoJSON | null = null
  let highlightedLayer: L.Path | null = null
  let airportMarkers: L.CircleMarker[] = []
  let stackControl!: AirspaceStackControl

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
            if (pos.coords.altitude != null) {
              stackControl.setValue(Math.round(pos.coords.altitude * 3.28084))
            }
          },
          (err) => console.warn('Geolocation error:', err.message),
          { enableHighAccuracy: true, timeout: 10_000 },
        )
      })
      return btn
    },
  })
  new HomeControl().addTo(map)

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
        const alt = stackControl.getValue()
        const url = `${location.origin}${location.pathname}?lat=${pos.lat.toFixed(6)}&lng=${pos.lng.toFixed(6)}&z=${z}&alt=${alt}`
        navigator.clipboard.writeText(url).then(() => {
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

  const GithubControl = L.Control.extend({
    options: { position: 'topleft' as L.ControlPosition },
    onAdd() {
      const btn = L.DomUtil.create('div', 'leaflet-bar github-control') as HTMLDivElement
      const a = L.DomUtil.create('a', '', btn) as HTMLAnchorElement
      a.href = 'https://github.com/mhaberler/airspace-lookup'
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.title = 'View source on GitHub'
      a.innerHTML = '<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>'
      L.DomEvent.disableClickPropagation(btn)
      return btn
    },
  })
  new GithubControl().addTo(map)

  const AIRPORT_ICON_COLOR: Record<number, string> = {
    3: '#1565C0',
    5: '#6A1B9A',
    4: '#00838F',
    7: '#00838F',
  }

  function airportColor(type: number): string {
    return AIRPORT_ICON_COLOR[type] ?? '#2E7D32'
  }

  function featureStyle(props: any): L.PathOptions {
    const active = props?.active ?? true
    const hex = airspaceColor({
      type: props?.type ?? 0,
      icaoClass: props?.icaoClass ?? 7,
      activity: props?.activity ?? 0,
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
      const feature = (highlightedLayer as any).feature as GeoJSON.Feature | undefined
      highlightedLayer.setStyle(featureStyle(feature?.properties))
      highlightedLayer = null
    }
  }

  function highlightAirspaceOnMap(entry: AirspaceEntry): void {
    resetHighlight()
    if (!currentGeojsonLayer) return

    currentGeojsonLayer.eachLayer((layer) => {
      const feature = (layer as any).feature as GeoJSON.Feature | undefined
      if (!feature) return
      const props = feature.properties
      if (props?.name === entry.name && props?.lowerFt === entry.lowerFt && props?.upperFt === entry.upperFt) {
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

  function updateUrl(): void {
    const pos = currentMarker ? currentMarker.getLatLng() : map.getCenter()
    const params = new URLSearchParams()
    params.set('lat', pos.lat.toFixed(6))
    params.set('lng', pos.lng.toFixed(6))
    params.set('z', String(map.getZoom()))
    const alt = stackControl.getValue()
    if (alt > 0) params.set('alt', String(alt))

    const baseKey = Object.entries(baseLayers).find(([, layer]) => map.hasLayer(layer))?.[0]
    if (baseKey && baseKey !== 'osm') params.set('base', baseKey)

    const activeOverlays = Object.entries(overlayLayers)
      .filter(([, layer]) => map.hasLayer(layer))
      .map(([key]) => key)
    if (activeOverlays.length) params.set('overlays', activeOverlays.join(','))

    history.replaceState(null, '', `${location.pathname}?${params}`)
  }

  stackControl = new AirspaceStackControl({
    onBlockClicked: (entry) => highlightAirspaceOnMap(entry),
    onAltChanged: () => updateUrl(),
  })
  stackControl.addTo(map)

  async function onMapClick(e: L.LeafletMouseEvent, callback: MarkerCallback): Promise<void> {
    const { lat, lng } = e.latlng
    console.log(`Map clicked: lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}`)

    if (currentMarker) {
      currentMarker.setLatLng(e.latlng)
    } else {
      currentMarker = L.marker(e.latlng).addTo(map)
    }

    const { popupText, geojson } = await callback(lat, lng)
    currentMarker.bindPopup(popupText).openPopup()

    resetHighlight()
    if (currentGeojsonLayer) {
      currentGeojsonLayer.remove()
      currentGeojsonLayer = null
    }

    if (geojson) {
      currentGeojsonLayer = L.geoJSON(geojson, {
        style: (feature) => featureStyle(feature?.properties),
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

      stackControl.update(geojson.features)
    } else {
      stackControl.clear()
    }

    for (const m of airportMarkers) m.bringToFront()
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
    stackControl.clear()
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  async function refreshAirports(): Promise<void> {
    const { lat, lng } = map.getCenter()
    const airports = await fetchAirports(lat, lng)
    for (const m of airportMarkers) m.remove()
    airportMarkers = []
    for (const airport of airports) {
      const [lngA, latA] = airport.geometry.coordinates
      const color = airportColor(airport.type)
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
      airportMarkers.push(marker)
    }
    for (const m of airportMarkers) m.bringToFront()
  }

  function scheduleRefreshAirports(): void {
    if (refreshTimer !== null) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      refreshAirports()
    }, 500)
  }

  map.on('click', (e: L.LeafletMouseEvent) => onMapClick(e, markerCallback))
  map.on('contextmenu', () => clearAll())
  map.on('moveend', () => { updateUrl(); scheduleRefreshAirports() })
  map.on('baselayerchange', () => updateUrl())
  map.on('overlayadd', () => updateUrl())
  map.on('overlayremove', () => updateUrl())

  const params = new URLSearchParams(location.search)
  const lat = parseFloat(params.get('lat') ?? '')
  const lng = parseFloat(params.get('lng') ?? '')
  const z = parseInt(params.get('z') ?? '12', 10)
  const alt = parseInt(params.get('alt') ?? '', 10)
  if (!isNaN(lat) && !isNaN(lng)) {
    const latlng = L.latLng(lat, lng)
    map.setView(latlng, z)
    map.fireEvent('click', { latlng } as L.LeafletMouseEvent)
  }
  if (!isNaN(alt) && alt > 0) {
    stackControl.setValue(alt)
  }
  const base = params.get('base')
  if (base && baseLayers[base]) {
    map.removeLayer(m_mono)
    map.addLayer(baseLayers[base])
  }
  const overlays = params.get('overlays')
  if (overlays) {
    for (const key of overlays.split(',')) {
      if (overlayLayers[key]) map.addLayer(overlayLayers[key])
    }
  }

  refreshAirports()
})
</script>
