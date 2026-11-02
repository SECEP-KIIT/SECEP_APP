import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'
import { startArrivals } from './pipeline'
import { initStore } from './store/db'

// Dev only (main.tsx imports this behind DEV && VITE_MOCK). Persistence is opt-in with VITE_MOCK_PERSIST=1.
initStore({ persistEnabled: import.meta.env.VITE_MOCK_PERSIST === '1' })
startArrivals()

export const worker = setupWorker(...handlers)
