import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Serves MSW's service worker in dev only, straight from node_modules. It's deliberately not in public/: Vite copies
// public/ into every build, and the worker must never ship to production. This also keeps the worker's version in
// step with the installed msw.
function mswWorkerDevOnly(): Plugin {
  return {
    name: 'msw-worker-dev-only',
    apply: 'serve',
    configureServer(server) {
      const file = createRequire(import.meta.url).resolve('msw/mockServiceWorker.js')
      server.middlewares.use('/mockServiceWorker.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(readFileSync(file))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mswWorkerDevOnly()],
  server: {
    // Same origin as production, where Caddy routes /api to the API (SRS §6.2), so the refresh
    // cookie works in dev. ws: true carries Socket.io, which runs on /api/socket.io (namespace /ws).
    proxy: {
      '/api': { target: 'http://localhost:4000', ws: true },
    },
  },
})
