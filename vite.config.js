import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      external: ['cesium'],
      output: {
        globals: {
          cesium: 'Cesium'
        },
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('mapbox-gl')) {
              return 'mapbox'
            }
            if (id.includes('@arcgis/core')) {
              return 'arcgis'
            }
            // Keep deck.gl and loaders.gl together to avoid circular dependency issues
            if (id.includes('@deck.gl') || id.includes('@loaders.gl')) {
              return 'deckgl-loaders'
            }
          }
        }
      }
    }
  }
})
