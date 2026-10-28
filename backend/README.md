# SECEP backend (M6 — API & Orchestrator)

Node.js 20+ / Express service. Today it only exposes a health check; the `/api/v1` REST API
(SRS §6.5), Socket.io, auth and the database come later.

## Setup
```powershell
cd backend
npm install
Copy-Item .env.example .env
```

## Scripts
| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto-restart on file changes, loading `.env` |
| `npm start` | Start without `.env` (in production, env vars come from docker-compose) |
| `npm test` | Run tests with the built-in `node:test` runner |

## Endpoints
| Method & path | Response |
| --- | --- |
| GET `/health` | `{ "status": "ok", "version": "<package version>" }` (NFR-OPS-002) |

## Layout
```
src/
  server.js       starts the HTTP server (Socket.io will attach here)
  app.js          builds the Express app; imported by tests without opening a port
  routes/         URL → controller wiring
  controllers/    HTTP concerns: request validation, auth checks, status codes
  services/       business logic and external calls (Postgres, Redis, Jira)
test/             node:test tests
```
