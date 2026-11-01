import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same origin as production, where Caddy routes /api to the API (SRS §6.2), so the refresh
    // cookie works in dev. ws: true carries Socket.io, which runs on /api/socket.io (namespace /ws).
    proxy: {
      '/api': { target: 'http://localhost:4000', ws: true },
    },
  },
})
