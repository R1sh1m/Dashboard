import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Ignore embedded firmware build artifacts so the dev watcher
      // doesn't crawl (and hit EBUSY locks on) esp_receiver/build/**.
      ignored: ['**/esp_receiver/build/**', '**/node_modules/**', '**/.git/**'],
    },
  },
})
