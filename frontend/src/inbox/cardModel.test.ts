import { describe, expect, it } from 'vitest'
import { createDb } from '../mocks/store/generate'
import { toListItem } from '../mocks/store/serialize'
import type { EmailListItem } from '../api/types'
import {
  activeFilterCount,
  addFilter,
  cardTags,
  cardTime,
  columnQuery,
  filterChips,
  matchesColumn,
  NO_FILTERS,
  senderRole,
  toggleFilter,
  urgencySplit,
  visibleTags,
  type ColumnFilters,
} from './cardModel'

const NOW = new Date('2026-11-04T10:00:00Z')
const db = createDb(NOW.getTime())
const base: EmailListItem = toListItem(db, [...db.emails.values()].find((e) => e.triage)!)
const email = (patch: Partial<EmailListItem> = {}): EmailListItem => ({
  ...base,
  security_flag: 'none',
  jira_key: null,
  proposed_action_count: 0,
  attachment_count: 0,
  reply_count: 0,
  duplicate_count: 0,
  has_masked_secret: false,
  snoozed_until: null,
  triage: base.triage && { ...base.triage, sentiment: { ...base.triage.sentiment, label: 'Neutral' } },
  ...patch,
})

describe('card tags (item 4, FR-UI-013/014)', () => {
  it('a clean, quiet email has no tags: no shield when clean, no sentiment unless Negative/Frustrated', () => {
    expect(cardTags(email(), NOW)).toEqual([])
  })

  it('orders security → action status → the rest, and only security/sentiment are filters', () => {
    const tags = cardTags(
      email({
        attachment_count: 2,
        reply_count: 4,
        duplicate_count: 3,
        has_masked_secret: true,
        security_flag: 'suspicious',
        jira_key: 'ATL-142',
        triage: { ...base.triage!, sentiment: { label: 'Frustrated', score: -0.8, confidence: 0.9 } },
      }),
      NOW,
    )
    expect(tags.map((t) => t.kind)).toEqual(['security', 'action', 'sentiment', 'attachments', 'replies', 'duplicates', 'masked'])
    expect(tags.filter((t) => t.filter).map((t) => t.kind)).toEqual(['security', 'sentiment'])
    expect(tags[1]).toMatchObject({ text: 'ATL-142', tone: 'ok' })
    expect(tags[5].text).toBe('×3')
  })

  it('a proposed action shows its count until a Jira key exists', () => {
    expect(cardTags(email({ proposed_action_count: 2 }), NOW)[0]).toMatchObject({ kind: 'action', text: '2', label: '2 proposed actions' })
  })

  it('snoozed only while the snooze is in the future', () => {
    expect(cardTags(email({ snoozed_until: '2026-11-05T09:00:00Z' }), NOW).map((t) => t.kind)).toEqual(['snoozed'])
    expect(cardTags(email({ snoozed_until: '2026-11-03T09:00:00Z' }), NOW)).toEqual([])
  })

  it('at most five, then +N (four tags + the +N keep the strip at five)', () => {
    const tags = cardTags(email({ attachment_count: 1, reply_count: 1, duplicate_count: 1, has_masked_secret: true, security_flag: 'malicious', jira_key: 'A-1' }), NOW)
    expect(tags).toHaveLength(6)
    const { shown, hidden } = visibleTags(tags)
    expect(shown).toHaveLength(4)
    expect(hidden).toBe(2)
    expect(visibleTags(tags.slice(0, 5))).toEqual({ shown: tags.slice(0, 5), hidden: 0 })
  })
})

describe('sender role (PROPOSED from.role_category)', () => {
  it('reads it when present and tolerates an API without it', () => {
    expect(senderRole(email({ from: { address: 'a@b.example', name: 'A', role_category: 'Manager' } as EmailListItem['from'] }))).toBe('Manager')
    expect(senderRole(email({ from: { address: 'a@b.example', name: 'A' } }))).toBeNull()
  })
})

describe('card time', () => {
  const now = new Date(2026, 10, 4, 15, 0)
  it('today as a time, this week as a weekday, older as a date', () => {
    expect(cardTime(new Date(2026, 10, 4, 9, 12).toISOString(), now, 'en-GB')).toBe('09:12')
    expect(cardTime(new Date(2026, 10, 2, 9, 12).toISOString(), now, 'en-GB')).toBe('Mon')
    expect(cardTime(new Date(2026, 9, 20, 9, 12).toISOString(), now, 'en-GB')).toBe('20 Oct')
  })
})

describe('column query (§6.4.1 GET /emails)', () => {
  const f: ColumnFilters = { ...NO_FILTERS, type: ['Task', 'Meeting'], flag: ['suspicious'], sender: ' contoso-client.example ', received_after: '2026-11-01' }

  it('comma-separated values, fixed key order, newest omitted', () => {
    expect(columnQuery(NO_FILTERS, 'newest', false)).toBe('')
    expect(columnQuery(f, 'urgency', false)).toBe('type=Task%2CMeeting&flag=suspicious&sender=contoso-client.example&received_after=2026-11-01&sort=urgency')
  })

  it('Focus mode narrows urgency to Critical and High (FR-UI-004), and can rule a column out entirely', () => {
    expect(columnQuery(NO_FILTERS, 'newest', true)).toBe('urgency=Critical%2CHigh')
    expect(columnQuery({ ...NO_FILTERS, urgency: ['High', 'Low'] }, 'newest', true)).toBe('urgency=High')
    expect(columnQuery({ ...NO_FILTERS, urgency: ['Low'] }, 'newest', true)).toBeNull()
  })

  it('the arrival matcher mirrors the server semantics: OR within, AND across', () => {
    const e = email({ from: { address: 'maya@contoso-client.example', name: 'Maya' }, security_flag: 'suspicious', received_at: '2026-11-04T09:00:00Z' })
    const type = e.triage!.email_type.label
    expect(matchesColumn(e, { ...f, type: [type] }, false)).toBe(true)
    expect(matchesColumn(e, { ...f, type: [type], received_before: '2026-11-03' }, false)).toBe(false)
    expect(matchesColumn(e, { ...NO_FILTERS, sender: 'maya@contoso-client.example' }, false)).toBe(true)
    expect(matchesColumn(e, { ...NO_FILTERS, sender: 'contoso.example' }, false)).toBe(false)
    expect(matchesColumn(email({ triage: null }), { ...NO_FILTERS, type: ['Task'] }, false)).toBe(false)
    const low = email({ triage: { ...base.triage!, urgency: { label: 'Low', confidence: 0.9 } } })
    expect(matchesColumn(low, NO_FILTERS, true)).toBe(false)
    expect(matchesColumn(low, NO_FILTERS, false)).toBe(true)
  })
})

describe('filters and chips', () => {
  it('toggle adds and removes; a tag click only ever adds', () => {
    const one = toggleFilter(NO_FILTERS, { group: 'urgency', value: 'High' })
    expect(one.urgency).toEqual(['High'])
    expect(toggleFilter(one, { group: 'urgency', value: 'High' }).urgency).toEqual([])
    expect(addFilter(one, { group: 'urgency', value: 'High' })).toBe(one)
  })

  it('one removable chip per active value', () => {
    const f: ColumnFilters = { ...NO_FILTERS, type: ['Task'], flag: ['malicious'], sender: 'x.example', received_before: '2026-11-03' }
    const chips = filterChips(f)
    expect(chips.map((c) => c.label)).toEqual(['Type: Task', 'Security: Malicious', 'From: x.example', 'Before 2026-11-03'])
    expect(activeFilterCount(f)).toBe(4)
    expect(chips[1].remove(f).flag).toEqual([])
    expect(chips[2].remove(f).sender).toBeNull()
  })
})

describe('header urgency split', () => {
  it('counts loaded, triaged cards in Critical → Low order, skipping empty urgencies', () => {
    const at = (label: 'Critical' | 'Low') => email({ triage: { ...base.triage!, urgency: { label, confidence: 1 } } })
    expect(urgencySplit([at('Low'), at('Critical'), at('Low'), email({ triage: null })])).toEqual([
      { urgency: 'Critical', count: 1 },
      { urgency: 'Low', count: 2 },
    ])
  })
})
