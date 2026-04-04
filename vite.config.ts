import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwind from '@tailwindcss/vite'
import DevtoolsJson from 'vite-plugin-devtools-json'
import VueDevTools from 'vite-plugin-vue-devtools'
export default defineConfig(({ mode }) => {
  // Default: best DX for local dev/CI
  // Override for GitHub Pages build:
  //   VITE_BASE=/airspace-lookup/ VITE_OUTDIR=docs npm run build
  const env = loadEnv(mode, process.cwd(), '')
  const base = process.env.VITE_BASE ?? env.VITE_BASE ?? '/'
  const outDir = process.env.VITE_OUTDIR ?? process.env.VITE_OUTDIR ?? 'dist'

  return {
    base,
    plugins: [vue(), tailwind(),
    ...(mode === 'development' ? [DevtoolsJson(), VueDevTools()] : []),
    ],
    build: {
      outDir,
      emptyOutDir: true,
    },
  }
})
