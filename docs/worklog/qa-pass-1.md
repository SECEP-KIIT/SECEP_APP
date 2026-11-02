# QA pass 1 (browser checks for tasks 4–6), 2 Nov 2026

## Commit A: Dev panel idle-lock control

- **What:** an "Idle lock: 1 min · 15 min · off" row in the dev panel (Ctrl+Shift+D). It sends the real `PATCH /me/preferences { idle_minutes }`, then writes the response into the `/me` cache, so the shell passes it to `lock.configure` exactly as Settings will (task 16).
- **Dev-only:** the dev panel loads only through the `import.meta.env.DEV && VITE_MOCK === '1'` dynamic import. The main chunk's hash is unchanged, and `dist` has no dev-panel strings.
- **Browser re-verification:** none needed; the user tested it in the QA pass.
