import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Builds straight into the Python app's static folder, so one server (and one link) serves everything.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: '../backend/static', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
