# Email Classifier (SECEP) — Project Briefing

## What this is
Email intelligence + task automation system for corporate employees (7th-sem capstone).
Ingests email (Gmail API, Microsoft Graph via OAuth 2.0) and classifies each message by:
type (Tasks / Info / Credentials / Meetings / Approval), urgency, and sentiment.
Credentials found in emails are masked before display or storage.
Results show on a Kanban-style dashboard with one-click routing to Jira and Google Calendar.
Phishing detection is NOT in scope — don't build or suggest it.

## Repo layout (monorepo)
- `frontend/`   — Vite + React PWA (vite-plugin-pwa), TanStack Query, react-grid-layout (desktop-only drag)
- `backend/`    — Node + Express, PostgreSQL via Prisma, Socket.io for real-time updates
- `ml-service/` — Python/FastAPI classifier. OWNED BY ML TEAM — do not modify; call over HTTP only
- `mobile/`     — Flutter Android app (later phase)
- `docs/`       — requirements, brief, and UML diagrams (see below)

## Stack decisions (already settled — don't propose alternatives)
- PostgreSQL, not MongoDB
- PWA everywhere, no separate native web build
- No n8n — automation lives in the backend
- Auth: Firebase Auth or Auth0 (undecided — ask before choosing)

## Reference docs (read when relevant, not every session)
- `docs/project-brief.md` — problem, MVP phases, out-of-scope items
- `docs/SRS.md` — full requirements (ISO/IEC/IEEE 29148, EARS format). Check the relevant section before building any feature, and cite requirement IDs in plans.
- `docs/diagrams/` — Mermaid UML diagrams:
  - `secep-usecase.mmd` — actors and use cases
  - `secep-activity.md` — workflow/activity diagram
  - `secep-class.mmd` — domain model; align backend models and API shapes with it
  - `secep-sequence.mmd` — interaction flows; follow these for API call order
- If code and diagrams disagree, flag it — don't silently pick one.
- When a change alters a flow or model, propose the matching diagram update.

## My scope
I own frontend + backend. ML models and DB schema design belong to teammates —
ask before changing `ml-service/` or anything in `backend/prisma/schema.prisma`.

## How to work with me
- Only touch the folder/module I name in the request.
- Plan first for anything multi-file; wait for my approval.
- For OAuth, auth, tokens, credential masking, and security code: explain each part — I need to understand it, not just paste it.
- Never hardcode secrets. Use `.env` files and provide a `.env.example`.
- After changes, run the relevant lint/tests and report results.
- Small, focused commits with clear messages.

## Environment
- Windows 11, PowerShell terminal — use PowerShell-compatible commands.
- Node via npm.