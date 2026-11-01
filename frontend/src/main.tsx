import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/app.css'
import App from './App.tsx'

// MSW is dev-only: import.meta.env.DEV is a build-time constant, so in production this branch and the dynamic
// import() are removed entirely and no mock code ships.
async function enableMocking() {
  if (!import.meta.env.DEV || import.meta.env.VITE_MOCK !== '1') return
  const { worker } = await import('./mocks/browser')
  await worker.start({
    // Warn about API calls with no mock; let everything else (Vite assets, HMR) through silently.
    onUnhandledRequest: (req, print) => {
      if (new URL(req.url).pathname.startsWith('/api/')) print.warning()
    },
  })
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
