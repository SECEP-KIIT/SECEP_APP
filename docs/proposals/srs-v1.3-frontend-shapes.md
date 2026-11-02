# Proposal for SRS v1.3: frontend wire shapes

Status: **PROPOSED**, not yet in the SRS. The frontend (M8) is built against these shapes on MSW mocks. They are typed in `frontend/src/api/types.ts` under "PROPOSED (pending SRS v1.3)". Each shape below names the route (SRS §6.5) or column (§6.6) it comes from. Conventions follow §6.4.1: snake_case, ISO UTC timestamps, arrays never `null`, lists as `{ items, next_cursor }`, errors in the §6.4.1 envelope.

Found while building task 4 (shell and lock screen). Later tasks will add to this file.

## 1. Read / unread state

**Gap:** FR-UI-002 (red Critical dot), FR-UI-005 (ambient glow) and FR-UI-021 (Unread quick chip) all need read state. Nothing in §6.4.1 or §6.6 stores it, and the Gmail scope is `gmail.readonly`, so SECEP can't use Gmail's UNREAD label as its own.

**Demo simplification (mock only):** the mock keeps read state internally, one reader per email. It is **not** a wire field yet. If a later task needs it on the card, the field would be `EmailListItem.read: boolean`, set via `PATCH /emails/:id { read }`.

**Production shape (proposed for M6/M7):** read state is **per recipient**, not a column on `emails`:

```sql
CREATE TABLE email_reads (
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_id, user_id));
```

`EmailListItem.read` is then computed for the caller. A single `emails.read_at` column must not become the final design. It assumes one reader per row and would break shared or delegated mailboxes. Task 5's mock store keeps read state in a per-user structure for the same reason.

## 2. `GET /me/glance`

§6.5 names the route ("Counts for the lock screen glance line"); no shape is given. It also feeds the sidebar count badges (FR-UI-002), so no extra endpoint is needed.

```json
{
  "counts": { "inbox_unread": 12, "critical_unread": 3, "board_todo": 4, "due_today": 5, "overdue": 1, "security_flags": 2 },
  "next_event": { "title": null, "start": "2026-11-04T05:30:00Z" },
  "subjects": null
}
```

- `security_flags` is `null` unless the caller has `security.review`.
- **Lock-screen privacy (FR-WP-001):** with `ui_prefs.glance_subjects` off (the default), `next_event.title` and `subjects` are `null`. The server enforces this, so a passer-by never sees content, only counts and a time.
  - **Decided (2 Nov):** event titles are gated like senders and subjects, under the same lock-screen threat model. The line keeps the time and reads "Next event · 11:00". This overrides the frontend-decisions example ("next: Standup 11:00"). If it proves too sparse, task 16 may add a separate calendar toggle rather than overloading `glance_subjects`.

## 3. `GET /notifications`

§6.5 names the route; §6.6 `notifications` has `kind` and a free-form `payload`. Proposed item (list in the §6.4.1 envelope):

```json
{ "id": "3", "kind": "new_email", "title": "New Critical email", "body": "R. Sen: Q3 board deck: final numbers by Friday 5 pm",
  "target": { "type": "email", "id": "uuid" }, "read_at": null, "created_at": "2026-11-04T09:12:40Z" }
```

- `kind`: `reminder | digest | meeting | new_email | jira_status` (the §6.6 comment).
- **Privacy rule:** `title` is generic and **never** contains a sender, subject, event title, card title or Jira issue key. Only the kind and timing may show. Details go in `body`. The lock screen shows only `title` unless `glance_subjects` is on. The bell (task 13) shows both.
  - `title` examples: "New Critical email", "Meeting in 15 min", "Reminder due", "Jira issue updated".
  - Issue keys count as content, because the project key often names a client or project ("ACME-12"). So "ATL-142 moved to Done" goes in `body`.
  - A meeting countdown is timing only, consistent with "Next event · 11:00" on the glance line.
- **ID conflict:** `notifications.id` is a `bigserial`, but §6.4.1 says IDs are UUID strings. Proposal: send it as a decimal string, or change the column to `uuid`.

## 4. `GET /projects`

§6.5 names the route. Proposed item: the §6.6 `projects` columns minus `tenant_id`, `owner_user_id` and `centroid`, plus a derived `progress`:

```json
{ "id": "uuid", "name": "Q3 board meeting", "colour": "#3b5bdb", "icon": "📊", "description": "…", "deadline": "2026-11-07T11:30:00Z",
  "jira_project_key": "ATL", "jira_epic": "ATL-100", "archived_at": null, "created_at": "…", "progress": { "done": 2, "total": 5 } }
```

- `colour` as `#rrggbb`. Item 5 / FR-UI-008 mention 8 swatches; the SRS should say whether `colour` is a hex value or a swatch name.
- `EmailListItem.projects[]` (currently `never[]`) is proposed as `{ id, name, colour, is_primary }`. It's needed from task 6.

## 5. `ui_prefs` keys and `PATCH /me/preferences`

The §6.6 comment names the keys; no types are given. Proposed (all optional; unset = default):

| Key | Type | Default | Used by |
| --- | --- | --- | --- |
| `motion` | `"full" \| "reduced" \| "off"` | unset = follow the OS | FR-UI-032 |
| `skip_lock` | boolean | `false` | FR-WP-001 |
| `idle_minutes` | integer 1–240, or `null` = off | `15` | FR-WP-004 |
| `glance_subjects` | boolean | `false` | FR-WP-001 |
| `sidebar_collapsed` | boolean | `false` | FR-UI-001 (**new key**) |

**Motion rule:** the most reduction wins between `motion` and the OS `prefers-reduced-motion`. An explicit `"full"` overrides the OS.

**`PATCH /me/preferences`** (§6.5 names it; no wire shape):
- Request: a partial object of the keys above. Unknown keys or wrong types → `422 validation_failed` with `details.fields`.
- Response: `{ "ui_prefs": { …the full stored object… } }`. `GET /me` returns the same object in `ui_prefs`.

The frontend mirrors `skip_lock`, `idle_minutes` and `motion` in `localStorage` (`secep.boot`), so the static lock screen can decide before `/me` answers. These values are non-personal and non-secret. The server copy stays authoritative.

## 6. Other notes from task 4

- **FR-UI-002 vs §6.7:** item 1 lists Calendar in the sidebar. It's now shown, since Calendar is being built (task 14).
- **Metrics visibility:** FR-UI-002 doesn't say who sees Metrics. The frontend shows it to admins only, because `GET /admin/metrics` is an admin route.

## 7. Found while building the mock backend (task 5)

1. **`notification.new` payload:** `{ notification: Notification }`, using the item shape from §3. §6.5 names the event; §6.4.1 doesn't define it.
2. **Model `metrics` (`GET /admin/models`):** §6.4.1 says `metrics` without a shape. Proposed (FR-ML-009/012):
   `{ type_macro_f1, urgency_macro_f1, sentiment_macro_f1, per_class_f1: { Task, Info, Credentials, Meeting, Approval }, ece }`.
   Confusion matrices for the model card (§7.2 step 9) can be added in task 15.
3. **Promotion gates:** `409 conflict` with `details.failed_gates` as human-readable strings, e.g. "Approval F1 drops by 0.050 (limit 0.03)".
4. **Accept failures (FR-ORC-006):** §6.4.1 says accept returns "`Action` (… or `failed` with `error`)" and lists `502 upstream_error`. The mock does this:
   - Jira 400/401: `200` with the `Action` in `status: failed` and `error: "Jira 401: …"`.
   - 429/5xx still failing after retries (honouring Retry-After): `502 upstream_error` with `details { provider: "jira", status, message }`, and the action is marked `failed`.
   - **Decision needed:** confirm this split.
5. **Accept on a non-proposed action:**
   - `done` returns the action unchanged (FR-ORC-005).
   - `executing` → `409`.
   - `rejected` → `409`.
   - `reject` is allowed only from `proposed` or `failed`.
6. **User cards (`POST /actions`):** created with `status: "done"` and `board_column: "todo"`, because there's nothing to execute. `PATCH /actions/:id` board moves are allowed only for `done` cards (`409` otherwise).
7. **`GET /links/:checkId/go` for a link still `pending`:** unreachable from the UI (pending links have `check_id: null`). If called anyway: `409 conflict`.
8. **Personal rules (FR-ML-013):** the corrected email itself gets `source: "user"`. Later emails from that sender get `source: "rule"`, and the rule's `hit_count` goes up. The rule is not applied to mail already received. `scope: "similar"` (FR-ML-014, S) is stored as a plain correction until similarity overrides are built.
9. **WebSocket payloads:** the §6.5 one-liner (`email.triaged {email_id, triage}`) and the §6.4.1 table (`{email_id, email: EmailListItem}`) disagree. The mock follows §6.4.1, which is marked final. §6.5 should be updated.
10. **Socket.io transport:** WebSocket only (`transports: ["websocket"]`), with no long-polling fallback. The access token goes in the handshake `auth` payload, never the URL. On `connect_error "unauthenticated"` the client refreshes once and reconnects.
11. **Reveal re-auth in the mock:** `reauth_url` is `/api/v1/auth/google?reauth=1`, a browser navigation, which MSW's service worker does not intercept. The dev panel offers "Re-sign in" instead. Task 15 decides how the UI performs the Google round trip.
12. **Card gap for task 6:** FR-UI-011 shows the sender's *role* on every card, but `EmailListItem` has no sender-role field (`role_category` exists only for users). A shape is needed before task 6, e.g. `from.role_category: RoleCategory | null`.
