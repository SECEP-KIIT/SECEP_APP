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
| `npm run lint` | Lint with oxlint |
| `npm run check` | Syntax-check every `.js` file with `node --check` (there's no TypeScript here) |

Before calling a change done, run `lint`, `check` and `test`.

## Configuration
Keys are defined in SRS §6.8; `.env.example` lists the ones M6 uses. Secrets (`*_FILE` keys) are read from
files under `backend/secrets/`, which is git-ignored. JSON contracts live in `../shared/schemas/` (owned by M6).

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
