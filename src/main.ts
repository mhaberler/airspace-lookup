import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import 'leaflet/dist/leaflet.css'
import {
  LMap,
  LTileLayer,
  LMarker,
  LPopup,
  LTooltip,
  LGeoJson,
  LControlZoom,
  LControlLayers,
  LControlScale,
} from '@maxel01/vue-leaflet'

const app = createApp(App)
app.component('LMap', LMap)
app.component('LTileLayer', LTileLayer)
app.component('LMarker', LMarker)
app.component('LPopup', LPopup)
app.component('LTooltip', LTooltip)
app.component('LGeoJson', LGeoJson)
app.component('LControlZoom', LControlZoom)
app.component('LControlLayers', LControlLayers)
app.component('LControlScale', LControlScale)

if (import.meta.env.DEV) {
  ;(app.config as any).devtools = true
  import('@vue/devtools').catch(() => {})
}

app.mount('#app')
