// Contract tests for the mock backend: every Must route through msw/node, checked against SRS §6.4.1/§6.5.
// M6 must pass the same expectations, so these double as its acceptance list.
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DecoderActionPayload } from '../api/types'
import { control } from './control'
import { handlers } from './handlers'
import { registry } from './http/route'
import { deliver } from './pipeline'
import { signIn } from './session'
import { verifyChain } from './store/audit'
import { db, initStore } from './store/db'
import { subscribe } from './store/events'
import { createDb } from './store/generate'
import { load, save, SCHEMA_VERSION, STORAGE_KEY } from './store/persist'
import { TEMPLATES } from './store/templates'

// msw resolves the handlers' relative /api/v1 paths against location, which Node doesn't have.
vi.stubGlobal('location', new URL('http://localhost/'))
const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  initStore({ persistEnabled: false })
  control.latency = [0, 0]
  control.speed = 1000 // simulated Jira/pipeline delays become ~ms
  control.jiraMode = 'ok'
})
afterEach(() => vi.useRealTimers())

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: string, path: string, { token, body }: { token?: string; body?: unknown } = {}) {
  const res = await fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = res.status === 204 ? '' : await res.text()
  let json: Json | null = null
  try {
    json = text ? (JSON.parse(text) as Json) : null
  } catch {
    json = null
  }
  return { status: res.status, json: json as Json, text, headers: res.headers }
}
const USER = { demo: 0, sam: 1, rita: 2 } as const
async function login(who: keyof typeof USER = 'demo') {
  signIn(db.users[USER[who]].id)
  const { json } = await call('POST', '/auth/refresh')
  return json.access_token as string
}
const keys = (o: object) => Object.keys(o).sort()
const sorted = (k: string[]) => [...k].sort()
const demoEmails = () => [...db.emails.values()].filter((e) => e.user_id === db.users[0].id)

// Key sets copied from SRS §6.4.1.
const LIST_KEYS = ['id', 'thread_id', 'from', 'to', 'cc', 'recipient_position', 'subject', 'received_at', 'status', 'security_flag', 'duplicate_count', 'attachment_count', 'reply_count', 'has_masked_secret', 'triage', 'summary_one_line', 'proposed_action_count', 'jira_key', 'pinned', 'snoozed_until', 'projects', 'tags']
const DETAIL_KEYS = [...LIST_KEYS, 'body_text', 'summary_short', 'actions', 'links', 'attachments', 'masked_secrets', 'auth_results', 'thread']
const TRIAGE_KEYS = ['email_type', 'urgency', 'sentiment', 'needs_review', 'model_version', 'processed_at']
const LINK_KEYS = ['check_id', 'anchor_text', 'host', 'verdict', 'go_url']
const ACTION_KEYS = ['id', 'email_id', 'type', 'origin', 'status', 'payload', 'board_column', 'board_position', 'external_ref', 'external_status', 'error', 'created_at', 'updated_at']
const ME_KEYS = ['id', 'email', 'display_name', 'role_category', 'is_admin', 'permissions', 'mailbox', 'ui_prefs']
const ERROR_KEYS = ['code', 'message', 'details', 'request_id']

describe('§6.4.1 shapes', () => {
  it('GET /me', async () => {
    const { json } = await call('GET', '/me', { token: await login() })
    expect(keys(json)).toEqual(sorted(ME_KEYS))
  })

  it('GET /emails and /emails/:id: exact keys, nothing the client must not see', async () => {
    const token = await login()
    const list = await call('GET', '/emails?limit=50', { token })
    expect(keys(list.json)).toEqual(['items', 'next_cursor'])
    expect(list.json.items).toHaveLength(50)
    for (const item of list.json.items) {
      expect(keys(item)).toEqual(sorted(LIST_KEYS))
      if (item.triage) expect(keys(item.triage)).toEqual(sorted(TRIAGE_KEYS))
    }
    for (const { id } of list.json.items.slice(0, 50)) {
      const { json: d } = await call('GET', `/emails/${id}`, { token })
      expect(keys(d)).toEqual(sorted(DETAIL_KEYS))
      for (const l of d.links) expect(keys(l)).toEqual(sorted(LINK_KEYS))
      for (const a of d.actions) expect(keys(a)).toEqual(sorted(ACTION_KEYS))
      // Masked tokens map in order onto masked_secrets.
      const tokens = [...d.body_text.matchAll(/\[MASKED:([a-z0-9_]+)\]/gi)].map((m: RegExpMatchArray) => m[1])
      expect(tokens).toEqual(d.masked_secrets.map((s: Json) => s.secret_type))
      const raw = JSON.stringify(d)
      for (const banned of ['ml_text', 'provider_message_id', 'message_id_hdr', 'value_enc', 'user_id', 'owner_user_id', '"url"', 'href', '"value"']) {
        expect(raw).not.toContain(banned)
      }
      expect(raw).not.toMatch(/https?:\/\//) // links only as LinkView (FR-SEC-004)
    }
  })

  it('every error uses the envelope', async () => {
    const { status, json } = await call('GET', '/me')
    expect(status).toBe(401)
    expect(keys(json)).toEqual(['error'])
    expect(keys(json.error)).toEqual(sorted(ERROR_KEYS))
    expect(json.error.code).toBe('unauthenticated')
  })
})

describe('access control (deny by default, FR-ADM-005)', () => {
  // §6.5 Must routes and their access rule. `owner` routes register as `user` and check ownership in the handler.
  const MUST: [string, string, string][] = [
    ['post', '/auth/refresh', 'cookie'], ['post', '/auth/logout', 'user'], ['get', '/me', 'user'],
    ['get', '/emails', 'user'], ['get', '/emails/:id', 'user'], ['patch', '/emails/:id/labels', 'user'],
    ['post', '/secrets/:id/reveal', 'user'], ['get', '/links/:checkId/go', 'user'], ['get', '/emails/:id/ics', 'user'],
    ['get', '/actions', 'user'], ['post', '/emails/:id/actions', 'user'], ['post', '/actions', 'user'],
    ['post', '/actions/:id/accept', 'user'], ['post', '/actions/:id/reject', 'user'], ['patch', '/actions/:id', 'user'],
    ['delete', '/mailboxes/me', 'user'],
    ['get', '/admin/settings', 'admin'], ['put', '/admin/settings', 'admin'], ['post', '/admin/settings/test', 'admin'],
    ['get', '/admin/users', 'admin'], ['post', '/admin/users', 'admin'], ['patch', '/admin/users/:id', 'admin'],
    ['get', '/admin/models', 'admin'], ['post', '/admin/models/retrain', 'admin'], ['post', '/admin/models/:id/promote', 'admin'],
    ['get', '/admin/metrics', 'admin'], ['get', '/security/flags', 'security.review'], ['get', '/audit', 'security.review'],
  ]
  it.each(MUST)('%s %s is registered as %s', (method, path, access) => {
    expect(registry).toContainEqual({ method, path, access })
  })

  it('403 for admin routes without admin, and for security routes without security.review', async () => {
    const sam = await login('sam')
    for (const path of ['/admin/settings', '/admin/users', '/admin/models', '/admin/metrics', '/security/flags', '/audit']) {
      const { status, json } = await call('GET', path, { token: sam })
      expect([path, status, json.error.code]).toEqual([path, 403, 'forbidden'])
    }
    const rita = await login('rita')
    expect((await call('GET', '/security/flags', { token: rita })).status).toBe(200)
    expect((await call('GET', '/audit', { token: rita })).status).toBe(200)
    expect((await call('GET', '/admin/settings', { token: rita })).status).toBe(403)
  })

  it("404 for another user's resources, so their ids aren't confirmed", async () => {
    const demoEmail = demoEmails()[0]
    const demoAction = [...db.actions.values()].find((a) => a.user_id === db.users[0].id)!
    const sam = await login('sam')
    expect((await call('GET', `/emails/${demoEmail.id}`, { token: sam })).status).toBe(404)
    expect((await call('POST', `/actions/${demoAction.id}/accept`, { token: sam, body: {} })).status).toBe(404)
  })

  it('unmatched /api/v1 paths are 404, never passed through', async () => {
    const { status, json } = await call('GET', '/definitely/not/a/route', { token: await login() })
    expect(status).toBe(404)
    expect(json.error.code).toBe('not_found')
  })
})

describe('GET /emails query (§6.4.1)', () => {
  it('pages with an opaque cursor; limit 1–50', async () => {
    const token = await login()
    const seen: string[] = []
    let cursor: string | null = ''
    while (cursor !== null) {
      const { json } = await call('GET', `/emails?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { token })
      seen.push(...json.items.map((e: Json) => e.id))
      cursor = json.next_cursor
    }
    expect(seen).toHaveLength(50)
    expect(new Set(seen).size).toBe(50)
    expect((await call('GET', '/emails?limit=51', { token })).status).toBe(400)
    expect((await call('GET', '/emails?cursor=nope', { token })).status).toBe(400)
  })

  it('newest first by default (FR-ORC-008)', async () => {
    const { json } = await call('GET', '/emails?limit=50', { token: await login() })
    const times = json.items.map((e: Json) => e.received_at)
    expect(times).toEqual([...times].sort().reverse())
  })

  it('OR within a parameter, AND across parameters', async () => {
    const token = await login()
    const { json } = await call('GET', '/emails?limit=50&type=Task,Meeting&urgency=High', { token })
    expect(json.items.length).toBeGreaterThan(0)
    for (const e of json.items) {
      expect(['Task', 'Meeting']).toContain(e.triage.email_type.label)
      expect(e.triage.urgency.label).toBe('High')
    }
    expect((await call('GET', '/emails?type=Spam', { token })).status).toBe(400)
  })

  it('flag, sender (address or domain) and date range', async () => {
    const token = await login()
    const flagged = await call('GET', '/emails?limit=50&flag=suspicious,malicious', { token })
    expect(flagged.json.items.length).toBeGreaterThan(0)
    for (const e of flagged.json.items) expect(e.security_flag).not.toBe('none')
    const domain = await call('GET', '/emails?limit=50&sender=contoso-client.example', { token })
    for (const e of domain.json.items) expect(e.from.address).toMatch(/@contoso-client\.example$/)
    const today = new Date().toISOString().slice(0, 10)
    const recent = await call('GET', `/emails?limit=50&received_after=${today}`, { token })
    for (const e of recent.json.items) expect(e.received_at.slice(0, 10) >= today).toBe(true)
  })

  it('keyword search runs over masked text only (FR-UI-026)', async () => {
    const token = await login()
    expect((await call('GET', '/emails?q=VPN%20account', { token })).json.items.length).toBeGreaterThan(0)
    // The fake secret value is never in the searchable text.
    expect((await call('GET', '/emails?q=Lantern-Orbit', { token })).json.items).toHaveLength(0)
  })
})

describe('actions (FR-ORC-001–007)', () => {
  const proposedJira = () =>
    [...db.actions.values()].find((a) => a.user_id === db.users[0].id && a.type === 'create_jira_issue' && a.status === 'proposed')!

  it('accepting a Jira action creates one issue, puts the card in To do, and a second accept returns the same key', async () => {
    const token = await login()
    const a = proposedJira()
    const first = await call('POST', `/actions/${a.id}/accept`, { token, body: {} })
    expect(first.status).toBe(200)
    expect(first.json).toMatchObject({ status: 'done', external_ref: expect.stringMatching(/^ATL-\d+$/), board_column: 'todo' })
    const again = await call('POST', `/actions/${a.id}/accept`, { token, body: {} })
    expect(again.json.external_ref).toBe(first.json.external_ref) // FR-ORC-005
    expect([...db.actions.values()].filter((x) => x.external_ref === first.json.external_ref)).toHaveLength(1)
  })

  it('maps urgency to priority when the proposal has none (FR-ORC-004)', async () => {
    const token = await login()
    const a = proposedJira()
    ;(a.payload as DecoderActionPayload).priority = null
    const { json } = await call('POST', `/actions/${a.id}/accept`, { token, body: {} })
    const urgency = db.emails.get(a.email_id!)!.triage!.urgency.label
    expect(json.payload.priority).toBe({ Critical: 'Highest', High: 'High', Medium: 'Medium', Low: 'Low' }[urgency])
  })

  it('Jira 401 fails the action with Jira’s error; 5xx after retries is 502 upstream_error (FR-ORC-006)', async () => {
    const token = await login()
    control.jiraMode = 'unauthorized'
    const failed = await call('POST', `/actions/${proposedJira().id}/accept`, { token, body: {} })
    expect(failed.status).toBe(200)
    expect(failed.json).toMatchObject({ status: 'failed', error: expect.stringContaining('Jira 401') })

    control.jiraMode = 'server_error'
    const down = await call('POST', `/actions/${proposedJira().id}/accept`, { token, body: {} })
    expect(down.status).toBe(502)
    expect(down.json.error).toMatchObject({ code: 'upstream_error', details: { provider: 'jira', status: 503 } })

    control.jiraMode = 'rate_limited_once'
    const retried = await call('POST', `/actions/${proposedJira().id}/accept`, { token, body: {} })
    expect(retried.json.status).toBe('done') // 429 retried after Retry-After
  })

  it('edits are validated; per-type rules give action_invalid (FR-ORC-002)', async () => {
    const token = await login()
    const a = proposedJira()
    const unknown = await call('POST', `/actions/${a.id}/accept`, { token, body: { payload: { colour: 'red' } } })
    expect([unknown.status, unknown.json.error.code]).toEqual([422, 'validation_failed'])
    const noTitle = await call('POST', `/actions/${a.id}/accept`, { token, body: { payload: { title: null } } })
    expect([noTitle.status, noTitle.json.error.code]).toEqual([422, 'action_invalid'])
    expect(noTitle.json.error.details.fields).toHaveProperty(['payload.title'])
  })

  it('reject, then board moves persist positions (FR-ORC-007)', async () => {
    const token = await login()
    const rejected = await call('POST', `/actions/${proposedJira().id}/reject`, { token })
    expect(rejected.json.status).toBe('rejected')
    const card = (await call('POST', '/actions', { token, body: { type: 'add_board_card', payload: { title: 'Call the bank' } } })).json
    expect(card).toMatchObject({ origin: 'user', email_id: null, board_column: 'todo' })
    const moved = await call('PATCH', `/actions/${card.id}`, { token, body: { board_column: 'in_progress', board_position: 0 } })
    expect(moved.json).toMatchObject({ board_column: 'in_progress', board_position: 0 })
    const column = (await call('GET', '/actions?column=in_progress&limit=50', { token })).json.items
    expect(column[0].id).toBe(card.id)
    expect(column.map((c: Json) => c.board_position)).toEqual(column.map((_: unknown, i: number) => i))
  })
})

describe('security (FR-SEC-003/004/008)', () => {
  it('Reveal needs a sign-in within 5 minutes, returns the value for 60 s, and audits without the value', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const token = await login()
    const secret = db.secrets.find((s) => s.owner_user_id === db.users[0].id)!
    vi.setSystemTime(Date.now() + 6 * 60_000)
    const stale = await call('POST', `/secrets/${secret.id}/reveal`, { token })
    expect(stale.status).toBe(401)
    expect(stale.json.error).toMatchObject({ code: 'reauth_required', details: { reauth_url: expect.any(String) } })

    signIn(db.users[0].id) // the Google round trip
    const ok = await call('POST', `/secrets/${secret.id}/reveal`, { token })
    expect(ok.json).toEqual({ value: secret.value, expires_in: 60 })
    const entry = db.audit.at(-1)!
    expect(entry.event).toBe('secret.reveal')
    expect(JSON.stringify(entry)).not.toContain(secret.value)
  })

  it('/links/:id/go: open when clean, interstitial with the chain when suspicious, blocked when malicious', async () => {
    const token = await login()
    const of = (v: string) => db.urlChecks.find((c) => c.verdict === v && db.emails.get(c.email_id)!.user_id === db.users[0].id)!
    expect((await call('GET', `/links/${of('clean').id}/go`, { token })).json).toEqual({ action: 'open', url: of('clean').final_url })
    const sus = (await call('GET', `/links/${of('suspicious').id}/go`, { token })).json
    expect(sus).toMatchObject({ action: 'interstitial', verdict: 'suspicious', chain: expect.arrayContaining([expect.any(String)]) })
    expect(sus.chain.length).toBeGreaterThan(1)
    expect((await call('GET', `/links/${of('malicious').id}/go`, { token })).json).toMatchObject({ action: 'blocked', verdict: 'malicious' })
  })

  it('the audit log is a valid hash chain, and tampering breaks it (FR-ADM-006)', async () => {
    const token = await login()
    await call('POST', `/actions/${[...db.actions.values()].find((a) => a.status === 'proposed' && a.user_id === db.users[0].id)!.id}/accept`, { token, body: {} })
    await call('PUT', '/admin/settings', { token, body: { poll_interval_s: 60 } })
    expect(db.audit.length).toBeGreaterThanOrEqual(2)
    expect(await verifyChain(db.audit)).toBe(true)
    const tampered = db.audit.map((r) => ({ ...r }))
    tampered[0].details = { forged: true }
    expect(await verifyChain(tampered)).toBe(false)
    const { json } = await call('GET', '/audit', { token })
    expect(keys(json.items[0])).toEqual(sorted(['id', 'created_at', 'actor', 'event', 'target', 'details', 'hash', 'prev_hash']))
  })
})

describe('labels (FR-ML-010, FR-ML-013)', () => {
  it('a correction with scope sender creates a personal rule that labels the next email from that sender', async () => {
    const token = await login()
    const tIndex = TEMPLATES.findIndex((t) => t.from === 2) // Arjun
    const email = demoEmails().find((e) => e.from.address === 'arjun.mehta@northwind.example')!
    const { status, json } = await call('PATCH', `/emails/${email.id}/labels`, { token, body: { field: 'urgency', value: 'Critical', scope: 'sender' } })
    expect(status).toBe(200)
    expect(keys(json)).toEqual(['correction_id', 'rule_id', 'triage'])
    expect(json.rule_id).toEqual(expect.any(String))
    expect(json.triage.urgency.label).toBe('Critical')

    await deliver(db.users[0].id, tIndex)
    const arrived = [...db.emails.values()].at(-1)!
    expect(arrived.triage!.urgency.label).toBe('Critical')
    expect(db.labelRules[0].hit_count).toBe(1)

    const bad = await call('PATCH', `/emails/${email.id}/labels`, { token, body: { field: 'urgency', value: 'Urgent' } })
    expect([bad.status, bad.json.error.code]).toEqual([422, 'validation_failed'])
  })

  it('an email_type correction marks the label as the user’s', async () => {
    const token = await login()
    const email = demoEmails().find((e) => e.triage?.email_type.label === 'Info')!
    const { json } = await call('PATCH', `/emails/${email.id}/labels`, { token, body: { field: 'email_type', value: 'Task' } })
    expect(json.triage.email_type).toMatchObject({ label: 'Task', source: 'user' })
    expect(json.rule_id).toBeNull()
  })
})

describe('admin', () => {
  it('settings never return secret values; secrets are write-only', async () => {
    const token = await login()
    const { json } = await call('GET', '/admin/settings', { token })
    expect(json.jira.token_set).toBe(true)
    expect(JSON.stringify(json)).not.toContain(db.settings.jira.token!)
    const put = await call('PUT', '/admin/settings', { token, body: { jira: { token: 'new-secret-token' } } })
    expect(put.text).not.toContain('new-secret-token')
    expect(JSON.stringify(db.audit.at(-1))).not.toContain('new-secret-token')
  })

  it('retrain → candidate → promote passes the gates; a worse candidate is refused with failed_gates (FR-ML-012)', async () => {
    const token = await login()
    const r = await call('POST', '/admin/models/retrain', { token })
    expect([r.status, r.json.job]).toEqual([202, 'retrain'])
    await new Promise((res) => setTimeout(res, 40))
    const candidate = db.models.find((m) => m.status === 'candidate')!
    const promoted = await call('POST', `/admin/models/${candidate.id}/promote`, { token })
    expect(promoted.json.status).toBe('promoted')
    expect(db.models.filter((m) => m.status === 'promoted')).toHaveLength(1)

    const worse = { ...structuredClone(candidate), id: crypto.randomUUID(), version: 'worse', status: 'candidate' as const }
    worse.metrics.per_class_f1.Approval -= 0.1
    db.models.push(worse)
    const refused = await call('POST', `/admin/models/${worse.id}/promote`, { token })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.failed_gates[0]).toMatch(/Approval/)
  })

  it('metrics and .ics', async () => {
    const token = await login()
    const m = (await call('GET', '/admin/metrics?days=30', { token })).json
    expect(keys(m)).toEqual(['confidence_histogram', 'override_rate_by_class', 'volume_by_type', 'window_days'])
    expect(m.confidence_histogram).toHaveLength(10)
    const meeting = demoEmails().find((e) => e.triage?.email_type.label === 'Meeting' && [...db.actions.values()].some((a) => a.email_id === e.id))!
    const ics = await call('GET', `/emails/${meeting.id}/ics`, { token })
    expect(ics.headers.get('Content-Type')).toMatch(/^text\/calendar/)
    expect(ics.text).toContain('BEGIN:VEVENT')
    const task = demoEmails().find((e) => e.triage?.email_type.label === 'Task')!
    expect((await call('GET', `/emails/${task.id}/ics`, { token })).status).toBe(404)
  })
})

describe('incoming mail and events (§6.4.1 WebSocket payloads)', () => {
  it('emits triaged → enriched → flagged with the documented payloads', async () => {
    const seen: [string, Json][] = []
    const off = subscribe((_u, event, payload) => seen.push([event, payload as Json]))
    const phishing = TEMPLATES.findIndex((t) => t.links?.some((l) => l.verdict === 'suspicious'))
    await deliver(db.users[0].id, phishing)
    off()
    const events = seen.map(([e]) => e).filter((e) => e.startsWith('email.'))
    expect(events).toEqual(['email.triaged', 'email.enriched', 'email.flagged'])
    const [, triaged] = seen.find(([e]) => e === 'email.triaged')!
    expect(keys(triaged)).toEqual(['email', 'email_id'])
    expect(keys(triaged.email)).toEqual(sorted(LIST_KEYS))
    expect(triaged.email.summary_one_line).toBeNull() // not enriched yet
    const [, enriched] = seen.find(([e]) => e === 'email.enriched')!
    expect(keys(enriched)).toEqual(['actions', 'email_id', 'status', 'summary_one_line', 'summary_short'])
    const [, flagged] = seen.find(([e]) => e === 'email.flagged')!
    expect(keys(flagged)).toEqual(['email_id', 'links', 'security_flag'])
    expect(flagged.security_flag).toBe('suspicious')
  })

  it('a revoked mailbox gets no new mail (FR-ADM-007)', async () => {
    const token = await login()
    expect((await call('DELETE', '/mailboxes/me', { token })).status).toBe(204)
    const before = db.emails.size
    await deliver(db.users[0].id, 0)
    expect(db.emails.size).toBe(before)
  })
})

describe('store', () => {
  it('generation is deterministic', () => {
    const t = Date.parse('2026-11-04T10:00:00Z')
    const a = createDb(t)
    const b = createDb(t)
    expect(JSON.stringify([...a.emails.values()])).toBe(JSON.stringify([...b.emails.values()]))
  })

  it('persists only user state, never secrets; versioned; arrivals replay to the same ids', async () => {
    const mem = new Map<string, string>()
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
    ;(globalThis as { localStorage?: unknown }).localStorage = storage
    try {
      initStore({ persistEnabled: true })
      await deliver(db.users[0].id, 0)
      const arrivedId = [...db.emails.values()].at(-1)!.id
      const action = [...db.actions.values()].find((a) => a.email_id === arrivedId)!
      action.status = 'rejected'
      save(storage, db, 20261104)

      const blob = mem.get(STORAGE_KEY)!
      for (const s of db.secrets) expect(blob).not.toContain(s.value)
      expect(blob).not.toContain(db.settings.jira.token!)
      expect(JSON.parse(blob).schema).toBe(SCHEMA_VERSION)

      initStore({ persistEnabled: true })
      expect(db.emails.has(arrivedId)).toBe(true)
      expect(db.actions.get(action.id)?.status).toBe('rejected')
      expect(db.secrets.find((s) => s.email_id === arrivedId)?.value ?? null).toBe(TEMPLATES[0].secrets?.[0]?.value ?? null)

      mem.set(STORAGE_KEY, JSON.stringify({ ...JSON.parse(blob), schema: SCHEMA_VERSION + 1 }))
      expect(load(storage, 20261104)).toBeNull()
      expect(mem.has(STORAGE_KEY)).toBe(false) // discarded, will reseed
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })
})
