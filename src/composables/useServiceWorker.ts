import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

export function useServiceWorker() {
  const needRefresh = ref(false)
  const offlineReady = ref(false)

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { needRefresh.value = true },
    onOfflineReady() { offlineReady.value = true },
  })

  return { needRefresh, offlineReady, updateSW }
}
