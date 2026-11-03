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

## 8. Decisions after task 5 (2 Nov 2026)

**Deviations accepted**
1. **Hand-rolled Socket.IO mock** (`frontend/src/mocks/socketio.ts`) instead of `@mswjs/socket.io-binding`. The binding hardcodes the default namespace `/`, so a connect to `/ws` never completes. It also never sends engine.io pings, so socket.io-client drops the connection every ~30 s. The app still uses the real socket.io-client; a test connects it to the mock end to end.
2. **socket.io-client is imported lazily** (`frontend/src/api/realtime.ts`). engine.io-client captures `globalThis.WebSocket` when its module is first evaluated, so a static import would load before MSW patches `WebSocket` and bypass the mock. As a side effect, socket.io-client (12.9 KB gz) moves out of the app chunk. M6 must keep the client config: WebSocket transport, path `/api/socket.io`, namespace `/ws`, token in the handshake `auth`.

**Decisions**
3. **Failed accept (FR-ORC-006): confirmed.**
   - Jira 400/401 → `200` with the action at `status: "failed"` and Jira's message in `error`.
   - Persistent 429/5xx (after retries honouring Retry-After) → `502 upstream_error`, `details { provider: "jira", status, message }`.
   - To be written into §6.4.1 in v1.3 (replaces the "decision needed" in §7.4 above).
4. **`email.triaged` payload: §6.4.1 is final.** The §6.5 WebSocket one-liner (`email.triaged {email_id, triage}`, and the matching lines for the other events) **must be reconciled to §6.4.1 in v1.3**.
5. **`from.role_category`: PROPOSED only.** `EmailListItem.from` (a `Person`) gets `role_category: RoleCategory | null`, using the 7-role enum from §6.6 (`Executive, Manager, Engineer, Analyst, Consultant, Client-facing, Other`). `null` means the sender's role is unknown. It is needed for FR-UI-011 (sender role on every card). It is **not** folded into the final §6.4.1 `Person` shape until v1.3 adopts it. Typed as `SenderPerson` in the PROPOSED section of `frontend/src/api/types.ts`.
6. **Model `metrics` shape (§7.2 above): stays PROPOSED.** Not demo-critical; to be reviewed before task 10.

**Persistence scope, confirmed:** besides prefs, read state, actions, projects and layouts, the mock also persists label corrections and rules, admin users and settings (without secrets), models and the audit log. All of it sits under the same schema-version guard (discard and reseed on mismatch). Secret values and tokens are never persisted. The dev panel keeps a manual "Reset store" button.

## 9. Found while building cards and the column widget (task 6, 2 Nov 2026), **parked for review**

Task 6 builds only what §6.4.1 / §6.5 fully define. The items below have no wire shape or no defined meaning, so they are **not built**, and the unattended run stopped after task 6 instead of continuing to task 7 (halt-don't-invent rule). Each entry names what the UI needs and a suggested shape. The suggestions are proposals only; nothing below is mocked or typed yet.

**Blocking a Must requirement**

1. **Quick chips (FR-UI-021, M): Unread · Due today · Needs my reply · Overdue.** None of the four can be expressed with the §6.4.1 `GET /emails` query.
   - *Unread:* needs read state on the wire (§1 suggests `EmailListItem.read: boolean`, computed per caller from `email_reads`) **and** a query parameter, e.g. `read=false`.
   - *Due today / Overdue:* need an email due date (item 2) and values for the S parameter `due`, which §6.5 names without values. Suggested: `due=overdue|today|week|none`, in the user's time zone (which also needs a source: `ui_prefs.time_zone`, or `tz=` on the request).
   - *Needs my reply:* no definition anywhere. One option: `recipient_position = "to"`, the latest thread message is not from me, and the type is Task, Approval or Meeting. Needs a decision, then a parameter (e.g. `is=needs_reply`, matching the FR-UI-025 `is:` operator).
2. **Email due date (FR-UI-013, M: "due dates as one word of context coloured by proximity").** `EmailListItem` has no due field. The only due dates are in proposed action payloads (`DecoderActionPayload.due_date`), which the list item doesn't carry. Suggested: `EmailListItem.due_at: string | null`, the earliest `due_date` among the email's open actions (with a `due_time` where known). This also feeds the Due filter group, `sort=due` and Smart sort.

**Should requirements**

3. **Projects on cards and the Project filter (FR-UI-017, FR-UI-021).** §4 suggests `EmailListItem.projects[]` = `{ id, name, colour, is_primary }`, with `project=<id>,<id>` as the query value. **Confirm** this before the split dot and chip are built (task 10).
4. **Status filter group (FR-UI-021).** "Status" is undefined: the email pipeline status (`ingested … enrich_failed`), the action status, or pinned/snoozed/read? The S parameter `status` has no values.
5. **Has attachments / notes (FR-UI-021).** No parameter. Suggested: `has=attachments,notes`, mirroring the FR-UI-025 `has:` operator.
6. **Every tag as a filter (FR-UI-014).** Only type, urgency, security and sentiment have parameters, so only those are clickable now. Attachments, replies, duplicates, masked secret, Jira and snoozed need e.g. `has=attachments,replies,duplicates,secret,jira`, plus values for the S parameter `snoozed` (e.g. `snoozed=true|false`).
7. **Facet counts (FR-UI-022) — `GET /emails/facets` has no shape.** Suggested: the same query as `GET /emails`; the response counts each group's options with that group's own selection left out, e.g. `{ "type": { "Task": 12, … }, "urgency": { … }, "sentiment": { … }, "flag": { … }, "total": 48 }`.
8. **Column count and urgency bar (item 3 "count plus a thin bar split by urgency").** `Page` has no total. The header shows the loaded count ("25+") and the urgency split of the loaded cards, which is honest but partial. The facets `total` and `urgency` counts (7) would make it exact.
9. **Smart sort (FR-UI-023).** The weights ("urgency, due proximity, unread and sender seniority, decaying with age") and the per-card explanation (ⓘ) have no shape. Suggested: when `sort=smart`, each item carries `rank_reasons: string[]` (e.g. `["Critical", "Due today", "From an Executive"]`). The mock accepts `smart` and `due` and serves them as newest; the UI doesn't offer them yet.
10. **External sender tag ↗ (FR-UI-014).** "External" depends on `tenants.domains`, which the client never sees. Suggested: `EmailListItem.from_external: boolean`, computed by M6.
11. **`⚡ Jira` vs a count (item 4).** The list item has `proposed_action_count` but not the action types, so the card shows `⚡ 2` ("2 proposed actions"), not `⚡ Jira`. Suggested: `proposed_action_types: ActionType[]`. Optional; the drawer (task 7) lists the actions anyway.
12. **Note tag 📝 and custom tags (FR-UI-014).** Need `EmailListItem.note_count` (or `has_note`) and the `tags[]` element shape (`{ id, name, colour }`). Both come with notes and tags (task 12).

**Needed by task 7 (found early)**

13. **The "Done" quick action (item 3 layer 2: Jira · Calendar · Done · ⋯).** What "Done" means for an *email* is undefined. Options: reject all of the email's open proposals; or mark the email handled, which needs a new field. Needs a decision before task 7 builds the quick actions.

**Smaller notes**

14. **`correction_id` type.** `PATCH /emails/:id/labels` returns `correction_id`. `corrections.id` is a `bigserial`, but §6.4.1 says IDs are UUID strings; the mock sends a number. Same conflict as `notifications.id` (§3); resolve both the same way.
15. **Unknown `sort` values.** The mock answers `400 bad_request` for a value outside `smart|newest|oldest|due|urgency|sender|confidence`, following the §6.4.1 "malformed query" row. The SRS doesn't say; confirm.
16. **Pinned first.** FR-UI-023 says pinned cards stay on top; the mock applies this under every sort, including the Must `newest`.

## 10. Decisions on §9 (2 Nov 2026), resolved for the mock (PROPOSED, pending v1.3)

These were decided by the user after task 6. The mock and the frontend implement them. They stay PROPOSED until SRS v1.3 adopts them.

1. **Quick chips (§9.1): `GET /emails?view=unread|due_today|needs_reply|overdue`**, comma-separated and **AND-combined** (an email must satisfy every listed view), and AND-combined with the other parameters.
   - `unread`: no read row for the current user (`email_reads`, §1).
   - `due_today` / `overdue`: use the derived `due_date` (item 2). `due_today` = `due_date` is today; `overdue` = `due_date` before today, **excluding handled** emails.
   - `needs_reply`: **NEEDS TEAM SIGN-OFF.** FR-UI-021 is a Must with no SRS definition. The mock implements this demo predicate:
     - the thread's latest message is inbound (not from the user);
     - the type is Task, Approval or Meeting;
     - the email has no accepted action (status `accepted`, `executing` or `done`).
2. **Email due date (§9.2): `EmailListItem.due_date: string (YYYY-MM-DD) | null`, the same on `EmailDetail`.** Derived server-side: the earliest of
   - every non-null action `payload.due_date`, and
   - the date of every non-null calendar `payload.start`;
   - else `null`.

   The source of truth stays in `actions`.
3. **"Done" (§9.13): per-recipient handled state.** M6 table: `email_states(email_id, user_id, handled_at)`; the mock keeps a per-user map. **Reversible.** Handled emails are excluded from the default inbox and surfaced through a view. The field is named **handled**, never "done", so it can't be confused with `action.status = "done"`.
4. **Unknown `sort` (§9.15): `422 invalid_parameter`.** This is a new error code for the §6.4.1 table.
5. **`correction_id` (§9.14): a string (UUID).**

**How the mock reads these** (choices made while implementing, flagged for review; none changes the decisions above):
- **Wire field for handled:** `EmailListItem.handled: boolean` (a boolean like `pinned`; `handled_at` stays server-side). Set with `PATCH /emails/:id { handled: true | false }`; §6.5 already lists `PATCH /emails/:id` with `{pinned, snoozed_until}`. The response is the updated `EmailDetail` ("mutations return the updated resource").
- **Surfacing handled:** `view=handled` lists only handled emails. Without it, `GET /emails` omits handled emails. So `view=handled,overdue` is always empty, as overdue excludes handled.
- **Rejected actions don't count towards `due_date`:** a declined proposal isn't a commitment. Confirm.
- **Time zone for "today" and for converting a calendar `start` to a date:** the mock uses the browser's local time zone. M6 needs the user's zone (e.g. `ui_prefs.time_zone`); still open.
- **Unknown `view` values** also get `422 invalid_parameter`. Other malformed parameters (e.g. `type=Spam`) keep their `400 bad_request`; say if those should move to 422 too.

**Resolved in §12.3** (was open): how a read row gets created. Opening an email (implicit), or `PATCH /emails/:id { read }` as §1 suggested? The mock creates none yet, so the Unread chip works on the seeded read state, and opening the drawer doesn't mark anything read. `EmailListItem.read` is still not on the wire.

## 11. Found while building the drawer and actions (task 7, 2 Nov 2026)

1. **Composer assignee, project and epic (FR-ORC-012, M).** FR-ORC-012 says the ⇧J composer is prefilled with "assignee = the user and the primary project's Jira project and epic". The enrich.v1 action payload (§6.4, `DecoderActionPayload`) has no `assignee`, `jira_project_key` or `epic` field, so `POST /actions/:id/accept { payload }` can't carry them, and the mock rejects unknown payload fields.
   - **What the composer does now:** shows only title, description, priority and due date (plus start, end and attendees for events). The issue goes to the tenant's Jira project from `/admin/settings`.
   - **Nothing is invented:** there is no assignee control and no read-only "Assignee: you" text.
   - **Suggested for v1.3:** either M6 always assigns to the user's linked Jira account (then nothing is needed on the wire beyond saying so), or the payload gains `assignee: "me" | null` and `jira_project_key` / `jira_epic`, filled from the email's primary project (§4, task 10).
2. **Popup blocking on link open.** The client opens a link only after the `/links/:checkId/go` round trip. Browsers allow `window.open` for a short time after the click (Chrome's transient activation is about 5 s), so it normally works; with a very slow check it could be blocked. No shape change; a browser check is listed in the task 7 worklog.

## 12. Decisions after the task 6–7 browser pass (2 Nov 2026)

1. **§10 approved,** with one condition: `PATCH /emails/:id { handled }` is **owner-only and per-user scoped**. It changes only the caller's own `email_states` row, and only for an email the caller can read (else 404, as for every other email route). For v1.3, consider merging handled and read into one per-user state endpoint.
2. **§11.1 / FR-ORC-012 composer prefill: partially met.**
   - **Assignee = the current user, now.** M6 assigns the issue to the caller's linked Jira account (§11.1's first option), so nothing new is needed on the wire. The composer shows a read-only "Assignee: you" line, and the mock's simulated Jira records the caller as assignee.
   - **The Jira project and epic prefill is deferred to task 10,** when projects carry their Jira config. The interim (omit the missing fields) stands. FR-ORC-012's remainder is tracked under task 10.
3. **Read-marking (was open in §10): PROPOSED.**
   - **Opening an email marks it read for the current user:** the client sends an explicit `PATCH /emails/:id { read: true }` when the drawer opens. It's per recipient, like handled (an `email_reads` row, §1).
   - **There is also a manual toggle:** Mark unread / Mark read (`{ read: false | true }`).
   - **On the wire:** `EmailListItem.read: boolean` (and on `EmailDetail`), computed for the caller.
   - **Same owner-only rule as handled.** The change goes out to the user's other tabs as `email.triaged`, like other `PATCH /emails/:id` changes.
   - **The Unread chip** (`view=unread`) now reflects live changes. An email read while the Unread chip is on leaves that list, the same way handled leaves the inbox.
   - **Implemented in the mock and the client (qa-pass-2-read).** `read` is in `EmailListItem` and `EmailPatch` (the PROPOSED parts of `src/api/types.ts`); this supersedes §1's "not a wire field yet". A card shows unread as a dot plus a heavier sender name. A failed automatic mark is silent and leaves the email unread.

## 13. Found while planning the tiling dashboard (task 8, 2 Nov 2026): **HALTED, needs a decision**

FR-UI-010 (S) saves layouts per user and device class through `GET, PUT /layouts/:deviceClass` (§6.5). **§6.4.1 defines no request or response shape for it.** The only hint is the §6.6 comment on `user_layouts.pages`: `[{name, order, widgets:[{type, x, y, w, h, title, colour, icon, filter, sort, density}]}]`. Every part of task 8 (pages, tiles, the title-bar menu, the gallery, saving) is built on this model, so nothing has been built.

**What's missing** (each is a needed field or rule, not a detail):
1. **Request and response bodies.**
   - What GET returns when nothing is saved yet: 404, or the starter layout?
   - Whether PUT replaces the whole layout or patches it.
   - Concurrent saves from two tabs: last write wins, or a 409?
   - How the client picks a `deviceClass`: the tablet breakpoint is undefined.
2. **Identity.** There is no `id` on pages or widgets, but duplicate, remove, rename, React keys and moves all need a stable one.
3. **Widget `type` values.** FR-UI-006 lists the views but gives no enum.
4. **`filter`, `sort`, `density`:** no format. Is `filter` a query string, or an object of §6.4.1 `GET /emails` parameters?
5. **`colour`:** "8 swatches" (FR-UI-008), with no names or values.
6. **`icon`:** no value set.
7. **Phone units (FR-UI-009).** Slots are half × 1, full × 1 and full × 2 cards, but neither `x, y, w, h` in slot units nor the slots per one-screen page is defined.
8. **Starter templates Today, Triage and Planning (FR-UI-007):** no contents. Do they come from the server or the client?
9. **Limits:** pages per device (Ctrl+1…9 suggests 9), widgets per page, body size.
10. **Routing.** Does `/` become the paged dashboard, with sidebar Inbox opening the single-column full view (FR-UI-006 "tile or full view")? Today `/` redirects to `/inbox`.

**Proposed shape (for approval; the mock would implement exactly this):**

```ts
type DeviceClass = 'desktop' | 'tablet' | 'phone'   // client: < 640 px phone, 640–1023 tablet, else desktop
// GET /layouts/:deviceClass → 200 Layout. Nothing saved: 200 with the starter pages and updated_at: null
//   (the server owns the templates, so every client gets the same ones). Unknown deviceClass → 400 bad_request.
// PUT /layouts/:deviceClass { pages, base_updated_at } → 200 Layout. Replaces the whole layout (ajv-validated).
//   base_updated_at older than the stored row → 409 conflict with details.current (another tab or device saved).
interface Layout { device_class: DeviceClass; pages: LayoutPage[]; updated_at: string | null }
interface LayoutPage { id: string /* uuid, client-generated */; name: string /* 1–40 chars */; order: number; widgets: Widget[] }
interface Widget {
  id: string                                 // uuid, client-generated
  type: 'inbox_column' | 'board' | 'projects' | 'reminders' | 'calendar' | 'notes' | 'stats' | 'security'
  x: number; y: number; w: number; h: number // grid units. Desktop and tablet: 12 columns, row = 1 card pitch.
                                             // Phone: 2 columns × 4 rows per screen (small 1×1, medium 2×1, large 2×2)
  title: string | null                       // null = the type's default title
  colour: 'slate' | 'blue' | 'teal' | 'green' | 'amber' | 'orange' | 'red' | 'violet' | null
  icon: string | null                        // a Lucide name from a fixed allowlist of about 24
  filter: EmailFilter | null                 // inbox_column only
  sort: 'smart' | 'newest' | 'oldest' | 'due' | 'urgency' | 'sender' | 'confidence' | null
  density: 'compact' | 'comfortable' | 'spacious' | null
}
// The §6.4.1 GET /emails parameters as an object, so ajv can check it and M6 can run it as a query unchanged.
interface EmailFilter {
  type?: EmailType[]; urgency?: Urgency[]; sentiment?: Sentiment[]; flag?: SecurityFlag[]
  sender?: string; received_after?: string; received_before?: string; view?: EmailView[]
}
```

- **Limits:** at most 9 pages and 24 widgets per page; a 64 KB body (413 above it).
- **Save cadence:** the client PUTs 800 ms after the last change (FR-UI-010).
- **Starters**, using only built widgets until tasks 10–15 add theirs:
  - **Today:** Due today, Needs my reply, and Critical + High.
  - **Triage:** Unread, Security (`flag=suspicious,malicious`), and Inbox.
  - **Planning:** Overdue, Inbox sorted by urgency, and a Board tile once task 10 lands.
- **Routing:** `/` is the paged dashboard; `/inbox` stays the full-view column, and sidebar Inbox opens it.
- **Gallery:** lists only widget types that are built. The others appear as their tasks land.

### 13a. Decided (2 Nov 2026): the §13 shape with these amendments; implemented in the mock and the client

- **`filter` is a `GET /emails` query string of filter parameters**, e.g. `urgency=Critical,High` or `view=due_today`. It replaces the `EmailFilter` object above, so there is no second format.
  - **Allowed parameters:** `type`, `urgency`, `sentiment`, `flag`, `sender`, `received_after`, `received_before`, `view`. Not `sort` (a separate field), `cursor`, `limit` or `q`.
  - The mock checks it with the same parser `GET /emails` uses.
  - It is `null` for every widget type except `inbox_column`.
- **Every page and widget has a stable uuid.** The starter layout's ids are stable too, so two GETs of the default return the same layout.
- **`colour`** is one of the 8 names (`slate … violet`), never a hex value. **`icon`** is a single emoji (one pictographic grapheme) or `null`.
- **PUT** `{ pages, base_updated_at }` is a full replace.
  - If `base_updated_at` doesn't match the stored `updated_at` (`null` when nothing is saved), the response is `409 conflict` with `details.updated_at`. The client drops its draft and reloads.
  - `updated_at` is strictly increasing.
- **GET with nothing saved** returns 200 with the starter layout, `is_default: true` and `updated_at: null`. Once anything is saved, `is_default` is `false`.
- **422 `validation_failed`** with `details.fields` covers: an unknown widget `type`, the caps (1–9 pages, ≤ 24 widgets per page), unknown keys, a bad filter, swatch, emoji, sort or density, a position outside the grid, and overlapping phone slots.
  - An unknown `deviceClass` in the path gets 400 `bad_request`.
  - **There is no 413:** the SRS has no such error code, and the caps plus field lengths bound the body.
- **Owner-only:** the row is keyed by the caller's user id from the token, and no request can name another user. Contract test: `layouts are owner-only`.
- **Grid units:**
  - **Desktop and tablet:** 12 columns, with 12 rows per screen. The row height follows the page height, and taller pages scroll.
  - **Phone:** 2 × 4 slots (`w`, `h` ∈ {1, 2}). The row height comes from the available height: 4 rows when each gets at least 110 px, otherwise 3 rows fill the screen and the 4th is a snap-scroll away.
- **Breakpoints:** one constant in `src/lib/breakpoints.ts`: phone ≤ 640, tablet 641–1023, desktop ≥ 1024. The layout device class, the idle lock and all CSS read it. The CSS selects on `<html data-device>`, and a test forbids width media queries.
- **Routing:** `/` is the paged dashboard. `/inbox` is the independent single-column view, and one commented line in `App.tsx` points `/` back at it. ⤢ on a tile opens `/inbox?<filter>&sort=…`.

## 14. Found while building the tiling dashboard (task 8a, 2 Nov 2026)

1. **"Due this week" (Planning starter) has no query vocabulary.** `GET /emails` has no parameter for it: `due` is a reserved S parameter with no values, and `view` has `due_today` and `overdue` only.
   - **Not built.** The Planning starter holds "Needs my reply" only. A comment in `src/mocks/starters.ts` marks where the column goes.
   - **Options:** (a) `view=due_this_week` (due_date from today to the end of the week, excluding handled; needs a week-start rule), or (b) give `due` values, e.g. `due=today|week|overdue`, folding in the two existing views.
2. **"Needs review (least-confident first)."** No `needs_review` filter parameter exists. The starter column is the inbox sorted with `sort=confidence`, so needs-review mail rises to the top, but the column also lists everything else.
   - If it should list only needs-review mail, it needs a parameter, e.g. `view=needs_review` (`triage.needs_review = true`). Confirm.
3. **Home in the navigation.** The sidebar and tab bar gained "Home" (`/`) first, otherwise the dashboard is unreachable. FR-UI-002's list doesn't name it. On phones it takes a tab slot, so Security moves under More (it shows only with `security.review` anyway). Confirm.
4. **Ctrl+1…9:** some browsers keep these keys for switching tabs and never deliver them to the page. Ctrl+←/→, the dots and swipe always work.

## 15. Decisions on §14 (2 Nov 2026), implemented in the mock and the client (PROPOSED for v1.3)

1. **`GET /emails?due=overdue|today|next_7_days|later|none`** (resolves §14.1). It is comma-separated, OR within the group and AND across groups, like `type` and `flag`. It reads the derived `due_date` (§10.2) against the user's local date (§10: the mock uses the browser zone; M6 needs `ui_prefs.time_zone`).
   - `overdue`: `due_date` < today.
   - `today`: `due_date` = today.
   - `next_7_days`: a **rolling** 7 days starting today (today … today + 6), so it includes today.
   - `later`: after those 7 days.
   - `none`: no due date.
   - An unknown value gets `400 bad_request`, like the other filter groups.
   - **The filter popover has a Due group now** (FR-UI-021).
   - `view=due_today` and `view=overdue` stay for the quick chips.
   - **Planning starter:** "Due this week" = `due=next_7_days`, then "Needs my reply".
   - The `due` value fills the reserved S parameter of the same name in §6.4.1.
2. **`GET /emails?needs_review=true|false`** (resolves §14.2): the triage.v1 `needs_review` flag; any other value is `400 bad_request`. The Triage starter's "Needs review" column is `needs_review=true`, `sort=confidence`. The popover has it as a "Review" group checkbox, and it shows as a removable chip.
3. **Home in the navigation** (resolves §14.3). It stays first in the sidebar. **This is a change to FR-UI-002 for v1.3:** "The sidebar shall list Home, Inbox, Board, Calendar, Security and Metrics …".
   - The **phone tab bar** is Home, Inbox, Board, Security, More. Security shows only with `security.review`, as in the sidebar. Calendar sits under More until its full view (task 14).
4. **Known browser limitation, for v1.3** (resolves §14.4): Ctrl+1…9 (FR-UI-007) can be reserved by the browser for tab switching and never reach the page. Ctrl+←/→, the dots and swipe always work. No change.
5. **Over-limit layout saves:** a `PUT /layouts/:deviceClass` above the caps (9 pages, 24 widgets per page) gets `422 validation_failed` with the standard error body (`details.fields`). The server never trims silently. The client refuses the edit before saving ("A dashboard holds up to 9 pages", "This page is full"), so it never sends one.
6. **Short phone screens: a deliberate exception to FR-UI-009's no-scroll rule.** With a screen (viewport) height **below 600 px**, a phone page shows 3 slot rows at a time and the 4th row is a snap-scroll away, rather than cramming 4 rows. At 600 px and taller, all 4 rows fill one screen with no vertical scroll. The layout data is the same 2 × 4 grid either way.

## 16. QA pass 3 (3 Nov 2026): changes for v1.3

Decided after the browser pass on QA pass 2, read-marking and tasks 8a–8c. Each item notes the commit that builds it.

1. **`email.enriched` has no `due_date`** (commit 1, a gap in §10.2). The PROPOSED `due_date` is derived on the server, but the §6.5 `email.enriched` payload doesn't carry it. A Due tile could therefore never count an arrival whose due date appears only at enrichment.
   - **For now:** the client applies the §10.2 rule (the earliest action `due_date` or calendar start date, rejected proposals excluded) to the event's `actions`. One rule in `src/lib/due.ts`, shared with the mock.
   - **For v1.3:** add `due_date: string | null` to the `email.enriched` payload. The server knows the user's time zone; the client uses the browser's.
2. **State changes are live in every session** (commit 1). When `PATCH /emails/:id` changes `handled`, `read`, `pinned` or `snoozed_until`, M6 sends `email.triaged` with the full `EmailListItem` to room `user:{id}`, so every other tab and device of that user settles its lists. The mock already did this, and the client now acts on it (F11 list settling). §6.5 describes `email.triaged` only as the triage result, so it needs one sentence: "also sent when the user's own state for the email changes".
3. **Layouts are ordered lists, not free placement** (commit 2). This changes FR-UI-008 ("a 12-column snap grid") and the §13a widget shape.
   - **Desktop and tablet:** a page is an ordered list of tiles that fill rows of 3 slots, left to right, top to bottom.
     - `small`, `medium` and `large` take 1, 2 or 3 slots.
     - A tile that doesn't fit the rest of a row starts the next one, pushing the tiles after it right, then down.
     - Each row is as tall as its tallest tile.
     - Dragging changes the order: same-size tiles swap; otherwise the dragged tile takes the target's place and the rest move one along.
     - FR-UI-008 for v1.3: "Tiles flow in order into rows of three slots; a tile is small, medium or large (1, 2 or 3 slots); dragging reorders them."
   - **Wire shape:** `Widget` loses `x`, `y`, `w` and `h`, and gains `size: 'small' | 'medium' | 'large'` and `hidden: boolean`. Array order is page order.
     - `size` applies to desktop and tablet; `hidden` applies to phone (commit 4's edit sheet). Both are present on every device class, so there is one shape.
     - `PUT` gets 422 for a bad `size` or `hidden`, and for the old position fields, which are now unknown.
     - The phone overlap check is gone, since nothing is placed.
   - **Migration** (`user_layouts` in M6; mock store schema 4 → 5):
     - sort each page's widgets by `y`, then `x`;
     - size from the width: grid `w` ≤ 4 is small, ≤ 8 medium, else large; phone half width small, full × 1 medium, full × 2 large;
     - `hidden: false`.
   - **Starters:** Today and Triage are three small tiles each (one row); Planning is Due this week (medium) and Needs my reply (small). Desktop and tablet share them.
   - **§15.6 is obsolete:** the phone no longer has slot rows, so the 600 px short-screen exception goes away. Commit 4 replaces the phone model and records the FR-UI-009 change.
4. **Phone dashboard: sections, not slots (option A)** (commit 4). This changes FR-UI-009 ("2 × 4 slot pages, no scrolling").
   - **Home on phone** is the page's widgets as stacked sections in one vertical scroll. Each section has:
     - a title and count;
     - its top 3 cards;
     - "See all n →", which opens the full column (`/inbox` with the widget's filter and sort).
   - Nothing scrolls inside a section, and new mail shows as "↑ n new" (FR-UI-024).
   - **Page switcher:** a segmented control at the top (Today | Triage | Planning | +) replaces the dots and the swipe. Phones don't use a horizontal swipe for pages.
   - **One slim header row:** the page switcher and Edit. There's no separate title or "Starter layout" row; the save state shows in the edit sheet.
   - **Editing:** Edit opens a bottom sheet listing the page's sections. Each row has a drag handle to reorder it and a switch to show or hide it, plus Add widget, the page name and Delete page (with the 10 s undo). The 8b long-press / ghost-slot editor is gone.
   - **Card actions on touch:** no hover bar. A tap opens the drawer; a long-press opens an action menu: Jira, Calendar, Done, Pin, Open.
   - **Layout data:** phone layouts store order plus `hidden`, the §16.3 shape (no slots). `size` is ignored on phone.
   - FR-UI-009 for v1.3: "On phones each dashboard page is a vertical list of sections, one per widget, each showing its top three items and a link to the full view; a segmented control switches pages; Edit opens a sheet to reorder, hide, add and remove sections; a long-press on a card opens its actions."
   - §15.6 (the 600 px short-screen exception) no longer applies.
5. **Lock screen on phone: the Loading box sits bottom centre** (commit 4). It's above the safe area and clear of the notifications, instead of right middle over them. Desktop keeps right middle. This changes FR-WP-003 for v1.3: "…a boxed Loading indicator at the right middle (bottom centre on phones)…"
