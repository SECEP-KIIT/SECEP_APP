import { describe, expect, it } from 'vitest'
import { emails, me, toListItem } from './fixtures'

// Key sets copied from SRS §6.4.1. Types already reject extra or missing fields; this catches anything that slips
// past them (spreads, casts) and documents the contract next to the mocks.
const LIST_KEYS = [
  'id', 'thread_id', 'from', 'to', 'cc', 'recipient_position', 'subject', 'received_at', 'status',
  'security_flag', 'duplicate_count', 'attachment_count', 'reply_count', 'has_masked_secret', 'triage',
  'summary_one_line', 'proposed_action_count', 'jira_key', 'pinned', 'snoozed_until', 'projects', 'tags',
]
const DETAIL_KEYS = [
  ...LIST_KEYS,
  'body_text', 'summary_short', 'actions', 'links', 'attachments', 'masked_secrets', 'auth_results', 'thread',
]
const TRIAGE_KEYS = ['email_type', 'urgency', 'sentiment', 'needs_review', 'model_version', 'processed_at']
const LINK_KEYS = ['check_id', 'anchor_text', 'host', 'verdict', 'go_url']
const ACTION_KEYS = [
  'id', 'email_id', 'type', 'origin', 'status', 'payload', 'board_column', 'board_position',
  'external_ref', 'external_status', 'error', 'created_at', 'updated_at',
]
const ME_KEYS = ['id', 'email', 'display_name', 'role_category', 'is_admin', 'permissions', 'mailbox', 'ui_prefs']

const keys = (o: object) => Object.keys(o).sort()
const sorted = (k: string[]) => [...k].sort()

describe('fixtures match §6.4.1 shapes exactly', () => {
  it.each(emails.map((e) => [e.subject, e] as const))('%s', (_, email) => {
    expect(keys(email)).toEqual(sorted(DETAIL_KEYS))
    expect(keys(toListItem(email))).toEqual(sorted(LIST_KEYS))
    if (email.triage) expect(keys(email.triage)).toEqual(sorted(TRIAGE_KEYS))
    for (const link of email.links) expect(keys(link)).toEqual(sorted(LINK_KEYS))
    for (const action of email.actions) expect(keys(action)).toEqual(sorted(ACTION_KEYS))
  })

  it('/me', () => {
    expect(keys(me)).toEqual(sorted(ME_KEYS))
  })

  it('never carries fields the client must not see', () => {
    const json = JSON.stringify(emails)
    for (const banned of ['ml_text', 'provider_message_id', 'message_id_hdr', 'value_enc', '"url"', 'href']) {
      expect(json).not.toContain(banned)
    }
    expect(json).not.toMatch(/https?:\/\//)
  })
})

describe('fixtures cover the demo path', () => {
  it('has all five types', () => {
    expect(new Set(emails.map((e) => e.triage?.email_type.label))).toEqual(
      new Set(['Task', 'Info', 'Credentials', 'Meeting', 'Approval']),
    )
  })

  it('has a Critical email', () => {
    expect(emails.some((e) => e.triage?.urgency.label === 'Critical')).toBe(true)
  })

  it('has a flagged email with a suspicious, checkable link (task 13)', () => {
    const phishing = emails.find((e) => e.security_flag === 'suspicious')
    const link = phishing?.links.find((l) => l.verdict === 'suspicious')
    expect(link?.go_url).toBe(`/api/v1/links/${link?.check_id}/go`)
  })

  it('has a masked credential whose tokens match masked_secrets in order (task 12)', () => {
    const creds = emails.filter((e) => e.has_masked_secret)
    expect(creds.length).toBeGreaterThan(0)
    for (const e of creds) {
      const tokens = [...e.body_text.matchAll(/\[MASKED:([a-z0-9_]+)\]/gi)].map((m) => m[1].toLowerCase())
      expect(tokens).toEqual(e.masked_secrets.map((s) => s.secret_type))
    }
  })

  it('keeps has_masked_secret, counts and thread consistent', () => {
    for (const e of emails) {
      expect(e.has_masked_secret).toBe(e.masked_secrets.length > 0)
      expect(e.attachment_count).toBe(e.attachments.length)
      expect(e.proposed_action_count).toBe(e.actions.filter((a) => a.status === 'proposed').length)
      if (e.thread) expect(e.reply_count).toBe(e.thread.message_count - 1)
      expect(e.summary_one_line === null).toBe(e.status !== 'enriched')
    }
  })

  it('has reply and duplicate counts for the tag strip', () => {
    expect(emails.some((e) => e.reply_count > 0)).toBe(true)
    expect(emails.some((e) => e.duplicate_count > 0)).toBe(true)
  })
})

// Fixtures must look like real API output: secrets already masked by the server (FR-SEC-006).
describe('fixtures contain no raw secrets', () => {
  // Only human-readable text; ids would trip the digit patterns.
  const raw = emails
    .flatMap((e) => [e.subject ?? '', e.body_text, e.summary_one_line ?? '', e.summary_short ?? ''])
    .join('\n')
  it.each([
    ['AWS key', /AKIA[0-9A-Z]{16}/],
    ['JWT', /eyJ[\w-]+\.[\w-]+/],
    ['PEM block', /-----BEGIN/],
    // (?!\s|\[MASKED) stops \s* backtracking past the space before a mask token
    ['labelled password', /\b(password|pwd|passcode)\s*[:=]\s*(?!\s|\[MASKED)/i],
    ['OTP next to keyword', /\b(code|otp)\b\D{0,20}\d{4,8}\b/i],
    ['card-length digit run', /\b(?:\d[ -]?){13,19}\b/],
  ])('%s', (_, pattern) => {
    expect(raw).not.toMatch(pattern)
  })
})
