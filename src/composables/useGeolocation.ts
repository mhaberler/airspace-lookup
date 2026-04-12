import { ref, onBeforeUnmount } from 'vue'

export interface UseGeolocationOptions extends PositionOptions {
  onFix?: (pos: GeolocationPosition) => void
  onError?: (err: GeolocationPositionError) => void
}

export function useGeolocation(opts: UseGeolocationOptions = {}) {
  const position = ref<GeolocationPosition | null>(null)
  const error = ref<GeolocationPositionError | null>(null)
  const watching = ref(false)
  let watchId: number | null = null

  const posOptions: PositionOptions = {
    enableHighAccuracy: opts.enableHighAccuracy ?? true,
    timeout: opts.timeout ?? 20_000,
    maximumAge: opts.maximumAge ?? 1_000,
  }

  function start(): void {
    if (watchId !== null) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const err = {
        code: 2,
        message: 'Geolocation not supported',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError
      error.value = err
      opts.onError?.(err)
      return
    }
    watching.value = true
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        position.value = pos
        error.value = null
        opts.onFix?.(pos)
      },
      (err) => {
        error.value = err
        opts.onError?.(err)
      },
      posOptions,
    )
  }

  function stop(): void {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    watching.value = false
  }

  onBeforeUnmount(stop)

  return { position, error, watching, start, stop }
}
