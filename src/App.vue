<template>
  <div id="app" class="h-screen">
    <div id="map" class="h-full w-full"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import L from 'leaflet'
import { MarkerCallback, markerCallback, fetchAirports, airportPopupHtml, airportTypeName, AIRPORT_FETCH_RADIUS_M } from './markerCallback'
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

  const openAipLayer = L.tileLayer(
    `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(import.meta.env.VITE_OPENAIP_KEY as string)}`,
    {
      attribution: '&copy; <a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer">openAIP</a>',
      maxZoom: 14,
      opacity: 0.8,
      zIndex: 4,
    },
  )

  // const skywaysLayer = L.tileLayer('https://thermal.kk7.ch/tiles/skyways_all_all/{z}/{x}/{y}.png?src=mah.priv.at', {
  //   attribution: '<a href="https://thermal.kk7.ch/" target="_blank">thermal.kk7.ch</a> <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank">CC-BY-NC-SA</a>',
  //   maxNativeZoom: 13,
  //   maxZoom: 18,
  //   tms: true,
  //   zIndex: 3,
  // })

  // const thermalsLayer = L.tileLayer('https://thermal.kk7.ch/tiles/thermals_jul_07/{z}/{x}/{y}.png?src=mah.priv.at', {
  //   attribution: '<a href="https://thermal.kk7.ch/" target="_blank">thermal.kk7.ch</a> <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank">CC-BY-NC-SA</a>',
  //   maxNativeZoom: 12,
  //   maxZoom: 18,
  //   tms: true,
  //   zIndex: 4,
  // })

  const baseLayers: Record<string, L.TileLayer> = {
    osm: m_mono,
    topo: m_topo,
    ortho: m_ortho,
  }
  const overlayLayers: Record<string, L.TileLayer> = {
    ofm: openFlightMapsLayer,
    openaip: openAipLayer,
    // skyways: skywaysLayer,
    // thermals: thermalsLayer,
  }

  const map = L.map('map', {
    center: [47, 15],
    zoom: 12,
    zoomControl: true,
    layers: [m_mono, openAipLayer],
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
      // Skyways: skywaysLayer,
      // 'Thermals Jul 07': thermalsLayer,
    },
  ).addTo(map)

  L.control.scale({
    imperial: false,
    maxWidth: 300,
  }).addTo(map)

  let currentMarker: L.Marker | null = null
  let currentGeojsonLayer: L.GeoJSON | null = null
  let highlightedLayer: L.Path | null = null
  const airportMarkerById = new Map<string, L.CircleMarker>()
  let stackControl!: AirspaceStackControl
  let lastAirportFetchCenter: L.LatLng | null = null
  let airportRefreshInFlight = false
  let pendingAirportRefreshCenter: L.LatLng | null = null
  const AIRPORT_REFETCH_THRESHOLD_M = AIRPORT_FETCH_RADIUS_M / 2
  const AIRPORT_DEBUG = import.meta.env.DEV && new URLSearchParams(location.search).get('debugAirports') === '1'

  function logAirportRefresh(event: string, details: Record<string, unknown>): void {
    if (!AIRPORT_DEBUG) return
    console.debug(`[airports] ${event}`, details)
  }

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

  const GitHubControl = L.Control.extend({
    options: { position: 'topleft' as L.ControlPosition },
    onAdd(_map: L.Map) {
      const btn = L.DomUtil.create('div', 'leaflet-bar github-control') as HTMLDivElement
      const a = L.DomUtil.create('a', '', btn) as HTMLAnchorElement
      a.href = 'https://github.com/mhaberler/airspace-lookup'
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

    for (const marker of airportMarkerById.values()) marker.bringToFront()
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

  async function refreshAirports(targetCenter?: L.LatLngExpression): Promise<void> {
    const center = targetCenter ? L.latLng(targetCenter) : map.getCenter()

    if (lastAirportFetchCenter) {
      const dist = map.distance(lastAirportFetchCenter, center)
      if (dist <= AIRPORT_REFETCH_THRESHOLD_M) {
        logAirportRefresh('skip-threshold', {
          distanceM: Math.round(dist),
          thresholdM: AIRPORT_REFETCH_THRESHOLD_M,
          center: center.toString(),
          lastCenter: lastAirportFetchCenter.toString(),
        })
        return
      }
    }

    if (airportRefreshInFlight) {
      pendingAirportRefreshCenter = center
      logAirportRefresh('queue-inflight', { center: center.toString() })
      return
    }

    airportRefreshInFlight = true
    try {
      logAirportRefresh('fetch-start', { center: center.toString() })
      const airports = await fetchAirports(center.lat, center.lng)
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

      lastAirportFetchCenter = center
      logAirportRefresh('fetch-done', {
        fetched: airports.length,
        added,
        updated,
        retained: airportMarkerById.size,
        center: center.toString(),
      })
    } finally {
      airportRefreshInFlight = false

      if (pendingAirportRefreshCenter) {
        const pendingCenter = pendingAirportRefreshCenter
        pendingAirportRefreshCenter = null
        logAirportRefresh('drain-queued', { center: pendingCenter.toString() })
        void refreshAirports(pendingCenter)
      }
    }
  }

  function scheduleRefreshAirports(): void {
    if (refreshTimer !== null) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      refreshAirports()
    }, 500)
  }

  map.on('click', (e: L.LeafletMouseEvent) => {
    onMapClick(e, markerCallback)
    logAirportRefresh('trigger-click', { center: e.latlng.toString() })
    void refreshAirports(e.latlng)
  })
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
    // Respect URL overlay selection by clearing defaults first.
    for (const layer of Object.values(overlayLayers)) {
      map.removeLayer(layer)
    }
    for (const key of overlays.split(',')) {
      if (overlayLayers[key]) map.addLayer(overlayLayers[key])
    }
  }

  refreshAirports()
})
</script>
