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

**Still open (not blocking; nothing invented for it):** how a read row gets created. Opening an email (implicit), or `PATCH /emails/:id { read }` as §1 suggested? The mock creates none yet, so the Unread chip works on the seeded read state, and opening the drawer doesn't mark anything read. `EmailListItem.read` is still not on the wire.

## 11. Found while building the drawer and actions (task 7, 2 Nov 2026)

1. **Composer assignee, project and epic (FR-ORC-012, M).** FR-ORC-012 says the ⇧J composer is prefilled with "assignee = the user and the primary project's Jira project and epic". The enrich.v1 action payload (§6.4, `DecoderActionPayload`) has no `assignee`, `jira_project_key` or `epic` field, so `POST /actions/:id/accept { payload }` can't carry them, and the mock rejects unknown payload fields.
   - **What the composer does now:** shows only title, description, priority and due date (plus start, end and attendees for events). The issue goes to the tenant's Jira project from `/admin/settings`.
   - **Nothing is invented:** there is no assignee control and no read-only "Assignee: you" text.
   - **Suggested for v1.3:** either M6 always assigns to the user's linked Jira account (then nothing is needed on the wire beyond saying so), or the payload gains `assignee: "me" | null` and `jira_project_key` / `jira_epic`, filled from the email's primary project (§4, task 10).
2. **Popup blocking on link open.** The client opens a link only after the `/links/:checkId/go` round trip. Browsers allow `window.open` for a short time after the click (Chrome's transient activation is about 5 s), so it normally works; with a very slow check it could be blocked. No shape change; a browser check is listed in the task 7 worklog.
