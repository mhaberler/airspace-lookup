import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  icaoClassName,
  airspaceTypeName,
  activityName,
} from '../airspaceStack'
import {
  airportPopupHtml as _airportPopupHtml,
  airportTypeName as _airportTypeName,
  formatAltitude,
  toFeet,
  activeFlags,
  isActive,
  type AirspaceItem,
  type AirportItem,
} from '../markerCallback'

export const AIRPORT_FETCH_RADIUS_M = 300_000
export const AIRSPACE_REFETCH_THRESHOLD_M = 10_000
export const AIRPORT_REFETCH_THRESHOLD_M = AIRPORT_FETCH_RADIUS_M / 2
const AIRSPACE_DIST_METERS = 10

const API_KEY = import.meta.env.VITE_OPENAIP_KEY as string

export interface LatLng {
  lat: number
  lng: number
}

export interface AirspaceLookup {
  popupText: string
  geojson: GeoJSON.FeatureCollection | null
}

export { type AirportItem }

export const airportPopupHtml = _airportPopupHtml
export const airportTypeName = _airportTypeName

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function useOpenAIP() {
  const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const onOnline = () => { online.value = true }
  const onOffline = () => { online.value = false }

  onMounted(() => {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  })

  let lastAirspaceFetchCenter: LatLng | null = null
  let lastAirportFetchCenter: LatLng | null = null
  let airportRefreshInFlight = false
  let pendingAirportRefreshCenter: LatLng | null = null

  async function fetchAirspaceAt(lat: number, lng: number): Promise<AirspaceLookup> {
    const url = `https://api.core.openaip.net/api/airspaces?pos=${lat},${lng}&dist=${AIRSPACE_DIST_METERS}&apiKey=${API_KEY}`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const items: AirspaceItem[] = data.items ?? []
      items.sort(
        (a, b) =>
          (a.lowerLimit ? toFeet(a.lowerLimit) : 0) -
          (b.lowerLimit ? toFeet(b.lowerLimit) : 0),
      )

      const popupText = items.length
        ? items
            .map((a) => {
              const lower = a.lowerLimit ? formatAltitude(a.lowerLimit) : '?'
              const upper = a.upperLimit ? formatAltitude(a.upperLimit) : '?'
              const { active, reason } = a.hoursOfOperation
                ? isActive(a.hoursOfOperation, lat, lng)
                : { active: true, reason: '24h' }
              const status = active
                ? `<span style="color:green">ACTIVE</span> (${reason})`
                : `<span style="color:grey">INACTIVE</span> (${reason})`
              const act = a.activity ? ` – ${activityName(a.activity)}` : ''
              const flags = activeFlags(a)
              const flagsHtml = flags.length ? ` [${flags.join(', ')}]` : ''
              return `<b>${a.name}</b> (${airspaceTypeName(a.type)}, ${icaoClassName(a.icaoClass)}${act}) — ${lower} / ${upper} — ${status}${flagsHtml}`
            })
            .join('<br>')
        : `No airspaces within ${AIRSPACE_DIST_METERS} m`

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: items
          .filter((a) => a.geometry)
          .map((a) => {
            const { active, reason } = a.hoursOfOperation
              ? isActive(a.hoursOfOperation, lat, lng)
              : { active: true, reason: '24h' }
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
            }
          }),
      }

      lastAirspaceFetchCenter = { lat, lng }
      return { popupText, geojson }
    } catch (err) {
      console.error('OpenAIP error:', err)
      const msg = !navigator.onLine
        ? 'Offline — no cached data for this location'
        : `Error: ${err}`
      return { popupText: msg, geojson: null }
    }
  }

  async function fetchAirportsAt(lat: number, lng: number): Promise<AirportItem[]> {
    const url = `https://api.core.openaip.net/api/airports?pos=${lat},${lng}&dist=${AIRPORT_FETCH_RADIUS_M}&apiKey=${API_KEY}`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return (data.items as AirportItem[]).filter((a) => a.frequencies?.length)
    } catch (err) {
      console.error('Airport fetch error:', err)
      return []
    }
  }

  function needsAirspaceRefetch(center: LatLng): boolean {
    if (lastAirspaceFetchCenter === null) return true
    return haversineM(lastAirspaceFetchCenter, center) > AIRSPACE_REFETCH_THRESHOLD_M
  }

  function needsAirportRefetch(center: LatLng): boolean {
    if (lastAirportFetchCenter === null) return true
    return haversineM(lastAirportFetchCenter, center) > AIRPORT_REFETCH_THRESHOLD_M
  }

  /**
   * Runs fetchAirportsAt with in-flight dedup and threshold skip.
   * Returns the fetched list, or null if the call was skipped/queued.
   * `onFetched` is invoked with the airports when a fetch actually completes.
   */
  async function refetchAirportsIfNeeded(
    center: LatLng,
    onFetched: (airports: AirportItem[], center: LatLng) => void,
  ): Promise<void> {
    if (lastAirportFetchCenter) {
      const dist = haversineM(lastAirportFetchCenter, center)
      if (dist <= AIRPORT_REFETCH_THRESHOLD_M) return
    }

    if (airportRefreshInFlight) {
      pendingAirportRefreshCenter = center
      return
    }

    airportRefreshInFlight = true
    try {
      const airports = await fetchAirportsAt(center.lat, center.lng)
      lastAirportFetchCenter = center
      onFetched(airports, center)
    } finally {
      airportRefreshInFlight = false
      if (pendingAirportRefreshCenter) {
        const pending = pendingAirportRefreshCenter
        pendingAirportRefreshCenter = null
        void refetchAirportsIfNeeded(pending, onFetched)
      }
    }
  }

  function resetAirspaceCenter(): void { lastAirspaceFetchCenter = null }
  function resetAirportCenter(): void { lastAirportFetchCenter = null }

  return {
    online,
    fetchAirspaceAt,
    fetchAirportsAt,
    needsAirspaceRefetch,
    needsAirportRefetch,
    refetchAirportsIfNeeded,
    resetAirspaceCenter,
    resetAirportCenter,
  }
}
