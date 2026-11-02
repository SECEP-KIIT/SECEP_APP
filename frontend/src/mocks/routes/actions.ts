// Actions (§6.5, §6.4.1): FR-ORC-001–007. Only allowlisted types with valid payloads execute, and only after the
// owner accepts (FR-ORC-002). One Jira issue per action (FR-ORC-005).
import type { ActionType, BoardColumn, DecoderActionPayload, JiraPriority, Urgency, UserCardPayload } from '../../api/types'
import { createIssue, JiraError } from '../jira'
import { page } from '../http/cursor'
import { errorResponse, Fail, own, route } from '../http/route'
import { isDate, isDateTime, isEmail, isInt, isOptStr, isStr, object, type Fields } from '../http/validate'
import { audit } from '../store/audit'
import { changed, db } from '../store/db'
import { publish } from '../store/events'
import { toAction, toListItem } from '../store/serialize'
import type { ActionRow, UserRow } from '../store/types'

const TYPES: ActionType[] = ['create_jira_issue', 'add_board_card', 'add_calendar_event']
const COLUMNS: BoardColumn[] = ['todo', 'in_progress', 'done']
const PRIORITIES: JiraPriority[] = ['Highest', 'High', 'Medium', 'Low']
const PAYLOAD_KEYS = ['title', 'description', 'priority', 'due_date', 'start', 'end', 'attendees'] as const

/** FR-ORC-004: urgency → Jira priority. */
export const PRIORITY_FOR: Record<Urgency, JiraPriority> = { Critical: 'Highest', High: 'High', Medium: 'Medium', Low: 'Low' }

/** enrich.v1 field rules for (partial) payload edits. */
function checkPayloadFields(f: Fields, p: Record<string, unknown>, prefix = 'payload.') {
  for (const k of Object.keys(p)) if (!(PAYLOAD_KEYS as readonly string[]).includes(k)) f.add(prefix + k, 'Unknown field')
  if ('title' in p && !isOptStr(p.title, 120)) f.add(`${prefix}title`, 'At most 120 characters')
  if ('description' in p && !isOptStr(p.description, 2000)) f.add(`${prefix}description`, 'At most 2000 characters')
  if ('priority' in p && p.priority !== null && !PRIORITIES.includes(p.priority as JiraPriority)) f.add(`${prefix}priority`, 'Not a Jira priority')
  if ('due_date' in p && p.due_date !== null && !isDate(p.due_date)) f.add(`${prefix}due_date`, 'Must be YYYY-MM-DD')
  for (const k of ['start', 'end'] as const) if (k in p && p[k] !== null && !isDateTime(p[k])) f.add(prefix + k, 'Must be an ISO date-time')
  if ('attendees' in p && p.attendees !== null && !(Array.isArray(p.attendees) && p.attendees.every(isEmail))) {
    f.add(`${prefix}attendees`, 'Must be a list of email addresses')
  }
}

/** §6.4 per-type rules, enforced before execution (FR-ORC-002). */
function checkTypeRules(type: ActionType, p: DecoderActionPayload, f: Fields) {
  if (!p.title) f.add('payload.title', 'Required')
  if (type === 'create_jira_issue' && !p.priority) f.add('payload.priority', 'Required for a Jira issue')
  if (type === 'add_calendar_event') {
    if (!p.start) f.add('payload.start', 'Required for a calendar event')
    if (!p.end) f.add('payload.end', 'Required for a calendar event')
    if (!p.attendees?.length) f.add('payload.attendees', 'Required for a calendar event')
    if (p.start && p.end && p.end <= p.start) f.add('payload.end', 'Must be after start')
  }
}

const now = () => new Date().toISOString()

/** Appends a card to the end of a board column (FR-ORC-007). */
function placeOnBoard(a: ActionRow, column: BoardColumn) {
  const others = [...db.actions.values()].filter((x) => x.user_id === a.user_id && x.board_column === column && x.id !== a.id)
  a.board_column = column
  a.board_position = others.length
}

function emitUpdated(a: ActionRow) {
  publish(a.user_id, 'action.updated', { action: toAction(a) })
  const email = a.email_id ? db.emails.get(a.email_id) : undefined
  // proposed_action_count / jira_key changed on the card: update it in place.
  if (email) publish(a.user_id, 'email.triaged', { email_id: email.id, email: toListItem(db, email) })
}

async function execute(a: ActionRow, user: UserRow): Promise<Response | ActionRow> {
  a.status = 'executing'
  a.updated_at = now()
  try {
    if (a.type === 'create_jira_issue') {
      a.external_ref = await createIssue() // FR-ORC-003
      a.external_status = 'To Do'
    } else if (a.type === 'add_calendar_event') {
      a.external_ref = `evt_${crypto.randomUUID().slice(0, 8)}` // simulated Google Calendar events.insert (FR-ORC-010)
    }
    a.status = 'done'
    a.error = null
    placeOnBoard(a, 'todo') // FR-ORC-007: accepted cards and created Jira issues land in To do
    await audit(user.id, 'action.execute', a.id, { type: a.type, outcome: 'done', external_ref: a.external_ref })
    return a
  } catch (err) {
    if (!(err instanceof JiraError)) throw err
    a.status = 'failed'
    a.error = `Jira ${err.status}: ${err.message}`
    await audit(user.id, 'action.execute', a.id, { type: a.type, outcome: 'failed', status: err.status })
    // 400/401: the action fails and the user sees Jira's error (FR-ORC-006). Retries exhausted on 429/5xx: 502.
    if (err.retryable) {
      return errorResponse(502, 'upstream_error', 'Jira is unavailable', { provider: 'jira', status: err.status, message: err.message })
    }
    return a
  } finally {
    a.updated_at = now()
    changed()
    emitUpdated(a)
  }
}

function boardMove(a: ActionRow, column: BoardColumn, position: number) {
  const cards = [...db.actions.values()]
    .filter((x) => x.user_id === a.user_id && x.board_column === column && x.id !== a.id)
    .sort((x, y) => (x.board_position ?? 0) - (y.board_position ?? 0))
  const from = a.board_column
  cards.splice(Math.min(position, cards.length), 0, a)
  cards.forEach((c, i) => {
    c.board_column = column
    c.board_position = i
  })
  // Close the gap in the column it left.
  if (from && from !== column) {
    ;[...db.actions.values()]
      .filter((x) => x.user_id === a.user_id && x.board_column === from)
      .sort((x, y) => (x.board_position ?? 0) - (y.board_position ?? 0))
      .forEach((c, i) => (c.board_position = i))
  }
}

export const actionRoutes = [
  route('get', '/actions', 'user', ({ user, url }) => {
    const status = url.searchParams.get('status')
    const column = url.searchParams.get('column')
    if (column && !COLUMNS.includes(column as BoardColumn)) throw new Fail(400, 'bad_request', 'Unknown column')
    const items = [...db.actions.values()]
      .filter((a) => a.user_id === user.id && (!status || a.status === status) && (!column || a.board_column === column))
      .sort((a, b) => (a.board_position ?? Infinity) - (b.board_position ?? Infinity) || b.created_at.localeCompare(a.created_at))
    return page(url, items.map(toAction))
  }),

  route<{ id: string }>('post', '/emails/:id/actions', 'user', ({ user, params, body }) => {
    const email = own(db.emails.get(params.id), user, 'Email')
    const f = object(body).only(['type', 'payload'])
    const type = f.body.type as ActionType
    if (!TYPES.includes(type)) f.add('type', 'Not an allowed action type')
    const raw = (f.body.payload ?? {}) as Record<string, unknown>
    checkPayloadFields(f, raw)
    f.done()
    const payload: DecoderActionPayload = { title: null, description: null, priority: null, due_date: null, start: null, end: null, attendees: null, ...raw }
    if (type === 'create_jira_issue' && !payload.priority && email.triage) payload.priority = PRIORITY_FOR[email.triage.urgency.label]
    checkTypeRules(type, payload, f)
    f.done('action_invalid', 'Action payload fails the per-type rules')
    const a: ActionRow = {
      id: crypto.randomUUID(), user_id: user.id, email_id: email.id, type, origin: 'user', status: 'proposed', payload,
      board_column: null, board_position: null, external_ref: null, external_status: null, error: null, created_at: now(), updated_at: now(),
    }
    db.actions.set(a.id, a)
    changed()
    emitUpdated(a)
    return toAction(a)
  }),

  // User card (FR-CNT-002): no email; lands in To do.
  route('post', '/actions', 'user', ({ user, body }) => {
    const f = object(body).only(['type', 'payload'])
    if (f.body.type !== 'add_board_card') f.add('type', 'Only add_board_card')
    const p = (f.body.payload ?? {}) as Partial<UserCardPayload>
    if (!isStr(p.title, 120) || !p.title) f.add('payload.title', 'Required, at most 120 characters')
    if (p.description !== undefined && !isOptStr(p.description, 2000)) f.add('payload.description', 'At most 2000 characters')
    if (p.due_date != null && !isDate(p.due_date)) f.add('payload.due_date', 'Must be YYYY-MM-DD')
    f.done()
    const payload: UserCardPayload = {
      title: p.title!, description: p.description ?? null, due_date: p.due_date ?? null, due_time: p.due_time ?? null,
      urgency: p.urgency ?? null, checklist: p.checklist ?? [], source: p.source ?? null, person: p.person ?? null,
    }
    const a: ActionRow = {
      id: crypto.randomUUID(), user_id: user.id, email_id: null, type: 'add_board_card', origin: 'user', status: 'done', payload,
      board_column: null, board_position: null, external_ref: null, external_status: null, error: null, created_at: now(), updated_at: now(),
    }
    placeOnBoard(a, 'todo')
    db.actions.set(a.id, a)
    changed()
    emitUpdated(a)
    return toAction(a)
  }),

  route<{ id: string }>('post', '/actions/:id/accept', 'user', async ({ user, params, body }) => {
    const a = own(db.actions.get(params.id), user, 'Action')
    // FR-ORC-005: already executed → return it as is; never a second issue.
    if (a.status === 'done') return toAction(a)
    if (a.status === 'executing') throw new Fail(409, 'conflict', 'Action is already executing')
    if (a.status === 'rejected') throw new Fail(409, 'conflict', 'Action was rejected')

    const f = object(body ?? {}).only(['payload', 'mode'])
    const edits = (f.body.payload ?? {}) as Record<string, unknown>
    if (typeof edits !== 'object' || Array.isArray(edits)) f.add('payload', 'Must be an object')
    else checkPayloadFields(f, edits)
    // mode "comment" (FR-ORC-013, S) is accepted and treated as "issue" until commenting is built.
    if (f.body.mode !== undefined && f.body.mode !== 'issue' && f.body.mode !== 'comment') f.add('mode', 'Must be issue or comment')
    f.done()

    const payload = { ...(a.payload as DecoderActionPayload), ...edits } as DecoderActionPayload
    const email = a.email_id ? db.emails.get(a.email_id) : undefined
    if (a.type === 'create_jira_issue' && !payload.priority && email?.triage) payload.priority = PRIORITY_FOR[email.triage.urgency.label]
    checkTypeRules(a.type, payload, f)
    f.done('action_invalid', 'Action payload fails the per-type rules')
    a.payload = payload

    const result = await execute(a, user)
    return result instanceof Response ? result : toAction(result)
  }),

  route<{ id: string }>('post', '/actions/:id/reject', 'user', ({ user, params }) => {
    const a = own(db.actions.get(params.id), user, 'Action')
    if (a.status !== 'proposed' && a.status !== 'failed') throw new Fail(409, 'conflict', `Cannot reject a ${a.status} action`)
    a.status = 'rejected'
    a.updated_at = now()
    changed()
    emitUpdated(a)
    return toAction(a)
  }),

  // Board moves (FR-ORC-007). The v1.1 fields (payload, pinned, snoozed_until) come with their features.
  route<{ id: string }>('patch', '/actions/:id', 'user', ({ user, params, body }) => {
    const a = own(db.actions.get(params.id), user, 'Action')
    const f = object(body).only(['board_column', 'board_position'])
    const column = f.body.board_column as BoardColumn
    if (!COLUMNS.includes(column)) f.add('board_column', 'Must be todo, in_progress or done')
    if (!isInt(f.body.board_position, 0, 10_000)) f.add('board_position', 'Must be a non-negative integer')
    f.done()
    if (a.status !== 'done') throw new Fail(409, 'conflict', 'Only cards on the board can move')
    boardMove(a, column, f.body.board_position as number)
    a.updated_at = now()
    changed()
    emitUpdated(a)
    return toAction(a)
  }),
]
