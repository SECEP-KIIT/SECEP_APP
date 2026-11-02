// Emails (§6.5, §6.4.1): list with the v1.2 query, detail, label correction (FR-ML-010, FR-ML-013), .ics (FR-ORC-017).
import type { DecoderActionPayload, EmailType, EmailView, Sentiment, SecurityFlag, TriageView, Urgency } from '../../api/types'
import { page } from '../http/cursor'
import { Fail, own, route } from '../http/route'
import { csv, isDate, isDateTime, object } from '../http/validate'
import { changed, db, emailsOf } from '../store/db'
import { publish } from '../store/events'
import { handledOf } from '../store/generate'
import { localDate, toDetail, toListItem } from '../store/serialize'
import type { EmailRow } from '../store/types'

const TYPES: EmailType[] = ['Task', 'Info', 'Credentials', 'Meeting', 'Approval']
const URGENCIES: Urgency[] = ['Low', 'Medium', 'High', 'Critical']
const SENTIMENTS: Sentiment[] = ['Positive', 'Neutral', 'Negative', 'Frustrated']
const FLAGS: SecurityFlag[] = ['none', 'suspicious', 'malicious']
const LABELS = { email_type: TYPES, urgency: URGENCIES, sentiment: SENTIMENTS } as const
const VIEWS: EmailView[] = ['unread', 'due_today', 'needs_reply', 'overdue', 'handled']
const REPLY_TYPES: EmailType[] = ['Task', 'Approval', 'Meeting']

/** `view` (PROPOSED, proposals §10.1): comma-separated, AND-combined. Unknown values: 422 invalid_parameter (§10). */
function views(url: URL): EmailView[] {
  const raw = url.searchParams.get('view')
  if (!raw) return []
  const list = raw.split(',').map((v) => v.trim()).filter(Boolean)
  const bad = list.filter((v) => !(VIEWS as string[]).includes(v))
  if (bad.length) throw new Fail(422, 'invalid_parameter', `Unknown view: ${bad.join(', ')}`, { parameter: 'view', allowed: VIEWS })
  return list as EmailView[]
}

/**
 * One view predicate for one email of `userId`. needs_reply is the demo rule (proposals §10.1, NEEDS TEAM SIGN-OFF):
 * latest thread message inbound, type Task/Approval/Meeting, no accepted action.
 */
function inView(view: EmailView, e: EmailRow, userId: string, today: string): boolean {
  const item = toListItem(db, e)
  switch (view) {
    case 'unread':
      return !(db.reads.get(userId)?.has(e.id) ?? false)
    case 'handled':
      return item.handled
    case 'due_today':
      return item.due_date === today
    case 'overdue':
      return item.due_date !== null && item.due_date < today && !item.handled
    case 'needs_reply': {
      const me = db.users.find((u) => u.id === userId)?.email.toLowerCase()
      const thread = e.thread_id ? db.threads.get(e.thread_id) : undefined
      const latest = thread?.messages.at(-1)?.from ?? e.from
      const accepted = [...db.actions.values()].some((a) => a.email_id === e.id && ['accepted', 'executing', 'done'].includes(a.status))
      return latest.address.toLowerCase() !== me && !!e.triage && REPLY_TYPES.includes(e.triage.email_type.label) && !accepted
    }
  }
}

function dateParam(url: URL, name: string) {
  const v = url.searchParams.get(name)
  if (v === null || v === '') return null
  if (!isDate(v)) throw new Fail(400, 'bad_request', `${name} must be YYYY-MM-DD`)
  return v
}

/** Keyword search over masked text only: subject and the stored (masked) body (FR-UI-026). */
const matchesKeywords = (e: EmailRow, q: string) => {
  const hay = `${e.subject ?? ''}\n${e.body_text}`.toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((term) => hay.includes(term))
}

function filtered(user: { id: string }, url: URL) {
  // OR within a parameter, AND across parameters (§6.4.1).
  const type = csv(url, 'type', TYPES)
  const urgency = csv(url, 'urgency', URGENCIES)
  const sentiment = csv(url, 'sentiment', SENTIMENTS)
  const flag = csv(url, 'flag', FLAGS)
  const sender = url.searchParams.get('sender')?.trim().toLowerCase() || null
  const after = dateParam(url, 'received_after')
  const before = dateParam(url, 'received_before')
  const q = url.searchParams.get('q')?.trim() || null
  const view = views(url)
  const today = localDate(new Date().toISOString())
  // The S parameters (project, due, status, pinned, snoozed, tag) are accepted and ignored until built (§6.4.1).
  const order = sorter(url)

  return emailsOf(user.id)
    .filter((e) => !type || (e.triage && type.includes(e.triage.email_type.label)))
    .filter((e) => !urgency || (e.triage && urgency.includes(e.triage.urgency.label)))
    .filter((e) => !sentiment || (e.triage && sentiment.includes(e.triage.sentiment.label)))
    .filter((e) => !flag || flag.includes(e.security_flag))
    .filter((e) => {
      if (!sender) return true
      const addr = e.from.address.toLowerCase()
      return addr === sender || addr.endsWith(`@${sender.replace(/^@/, '')}`)
    })
    .filter((e) => !after || e.received_at.slice(0, 10) >= after)
    .filter((e) => !before || e.received_at.slice(0, 10) <= before)
    .filter((e) => !q || matchesKeywords(e, q))
    // Handled mail leaves the default inbox and is surfaced with view=handled (proposals §10.3).
    .filter((e) => view.includes('handled') || !(db.handled.get(user.id)?.has(e.id) ?? false))
    .filter((e) => view.every((v) => inView(v, e, user.id, today)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || order(a, b)) // pinned stay on top (FR-UI-023)
}

const newest = (a: EmailRow, b: EmailRow) => b.received_at.localeCompare(a.received_at)
const RANK: Record<Urgency, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const senderKey = (e: EmailRow) => (e.from.name ?? e.from.address).toLowerCase()

/**
 * `sort` (§6.5 v1.1 list; newest is the default and the only Must sort, FR-ORC-008). Ties fall back to newest.
 * `smart` and `due` are accepted and served as newest until built: Smart's weights and per-card explanation and the
 * email due date have no shape yet (proposals §9). Untriaged emails sort last for urgency and confidence.
 */
function sorter(url: URL): (a: EmailRow, b: EmailRow) => number {
  const sort = url.searchParams.get('sort') || 'newest'
  switch (sort) {
    case 'newest':
    case 'smart':
    case 'due':
      return newest
    case 'oldest':
      return (a, b) => -newest(a, b)
    case 'urgency':
      return (a, b) => (a.triage ? RANK[a.triage.urgency.label] : 9) - (b.triage ? RANK[b.triage.urgency.label] : 9) || newest(a, b)
    case 'sender':
      return (a, b) => senderKey(a).localeCompare(senderKey(b)) || newest(a, b)
    case 'confidence':
      return (a, b) => (a.triage?.email_type.confidence ?? 2) - (b.triage?.email_type.confidence ?? 2) || newest(a, b)
    default:
      throw new Fail(422, 'invalid_parameter', 'sort must be smart, newest, oldest, due, urgency, sender or confidence', {
        parameter: 'sort',
      })
  }
}

/** RFC 5545 text escaping, so email-derived text can't inject calendar properties. */
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const icsDate = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export const emailRoutes = [
  route('get', '/emails', 'user', ({ user, url }) => page(url, filtered(user, url).map((e) => toListItem(db, e)))),

  route<{ id: string }>('get', '/emails/:id', 'user', ({ user, params }) =>
    toDetail(db, own(db.emails.get(params.id), user, 'Email')),
  ),

  // PATCH /emails/:id (§6.5 v1.1 {pinned, snoozed_until}; handled PROPOSED, §10.3). Returns the updated EmailDetail.
  route<{ id: string }>('patch', '/emails/:id', 'user', ({ user, params, body }) => {
    const email = own(db.emails.get(params.id), user, 'Email')
    const f = object(body).only(['pinned', 'snoozed_until', 'handled'])
    if ('pinned' in f.body && typeof f.body.pinned !== 'boolean') f.add('pinned', 'Must be true or false')
    if ('handled' in f.body && typeof f.body.handled !== 'boolean') f.add('handled', 'Must be true or false')
    if ('snoozed_until' in f.body && f.body.snoozed_until !== null && !isDateTime(f.body.snoozed_until)) f.add('snoozed_until', 'Must be an ISO date-time or null')
    f.done()
    if (typeof f.body.pinned === 'boolean') email.pinned = f.body.pinned
    if ('snoozed_until' in f.body) email.snoozed_until = f.body.snoozed_until as string | null
    if (typeof f.body.handled === 'boolean') {
      const handled = handledOf(db, user.id)
      if (f.body.handled) handled.set(email.id, handled.get(email.id) ?? new Date().toISOString())
      else handled.delete(email.id)
    }
    changed()
    publish(user.id, 'email.triaged', { email_id: email.id, email: toListItem(db, email) })
    return toDetail(db, email)
  }),

  route<{ id: string }>('patch', '/emails/:id/labels', 'user', ({ user, params, body }) => {
    const email = own(db.emails.get(params.id), user, 'Email')
    const f = object(body).only(['field', 'value', 'scope'])
    const field = f.body.field as keyof typeof LABELS
    const scope = (f.body.scope ?? 'email') as 'email' | 'sender' | 'similar'
    if (!(field in LABELS)) f.add('field', 'Must be email_type, urgency or sentiment')
    else if (!(LABELS[field] as readonly string[]).includes(f.body.value as string)) f.add('value', `Not a valid ${field}`)
    if (!['email', 'sender', 'similar'].includes(scope)) f.add('scope', 'Must be email, sender or similar')
    f.done()
    if (!email.triage) throw new Fail(409, 'conflict', 'Email is not triaged yet')

    const triage = email.triage as TriageView
    const value = f.body.value as string
    const correction = {
      id: crypto.randomUUID(), // a UUID string (proposals §10.5)
      email_id: email.id,
      user_id: user.id,
      field,
      old_label: triage[field].label,
      new_label: value,
      created_at: new Date().toISOString(),
    }
    db.corrections.push(correction) // FR-ML-010; feeds retraining (FR-ML-011)
    triage[field].label = value as never
    if (field === 'email_type') triage.email_type.source = 'user'
    triage.needs_review = false

    // FR-ML-013 "Always from this sender": a personal rule, this user only, never the shared model (FR-ML-015).
    // "Emails like this" (FR-ML-014, S) is stored as a plain correction until similarity overrides are built.
    let ruleId: string | null = null
    if (scope === 'sender') {
      const sender = email.from.address.toLowerCase()
      const existing = db.labelRules.find((r) => r.user_id === user.id && r.field === field && r.sender === sender)
      if (existing) existing.label = value
      else db.labelRules.push({ id: crypto.randomUUID(), user_id: user.id, field, sender, label: value, hit_count: 0, created_at: correction.created_at })
      ruleId = (existing ?? db.labelRules.at(-1)!).id
    }
    changed()
    // Relabel of a known email: clients update it in place (§6.4.1 email.triaged).
    publish(user.id, 'email.triaged', { email_id: email.id, email: toListItem(db, email) })
    return { triage: structuredClone(triage), correction_id: correction.id, rule_id: ruleId }
  }),

  route<{ id: string }>('get', '/emails/:id/ics', 'user', ({ user, params }) => {
    const email = own(db.emails.get(params.id), user, 'Email')
    const event = [...db.actions.values()].find((a) => a.email_id === email.id && a.type === 'add_calendar_event')
    const p = event?.payload as DecoderActionPayload | undefined
    if (email.triage?.email_type.label !== 'Meeting' || !p?.start || !p.end) {
      throw new Fail(404, 'not_found', 'No meeting time for this email')
    }
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SECEP//EN', 'BEGIN:VEVENT',
      `UID:${email.id}@secep`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
      `DTSTART:${icsDate(p.start)}`, `DTEND:${icsDate(p.end)}`,
      `SUMMARY:${icsText(p.title ?? email.subject ?? 'Meeting')}`,
      ...(p.description ? [`DESCRIPTION:${icsText(p.description)}`] : []),
      ...(p.attendees ?? []).map((a) => `ATTENDEE:mailto:${a}`),
      'END:VEVENT', 'END:VCALENDAR',
    ]
    return new Response(lines.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="meeting.ics"',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }),
]
