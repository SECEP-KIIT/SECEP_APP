# SECEP frontend (M8 — Web dashboard)

React 18 + TypeScript + Vite. Requirements: SRS §3.4, §3.8–3.15 and §6.7 (M8); design detail in
`../docs/frontend-decisions.md`; wire shapes in SRS §6.4.1.

## Setup
```powershell
cd frontend
npm install
npm run dev
```

## Scripts
| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5173 |
| `npm run build` | Typecheck and production build |
| `npm run typecheck` | `tsc -b` only |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run tests with vitest |
| `npm run preview` | Serve the production build |

Before calling a change done, run `lint`, `typecheck`, `test` and `build`.

## API in development
The dev server proxies `/api` (including the Socket.io WebSocket at `/api/socket.io`) to the backend on
`http://localhost:4000`, so the app uses same-origin paths just as it does in production behind Caddy.
Until a backend route exists, MSW mocks return the §6.4.1 shapes.
