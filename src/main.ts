import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import 'leaflet/dist/leaflet.css'

const app = createApp(App)

if (import.meta.env.DEV) {
  ;(app.config as any).devtools = true
  import('@vue/devtools').catch(() => {})
}

app.mount('#app')
