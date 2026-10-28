import { describe, expect, it } from 'vitest'
import mockEmails from '../mock/mockEmails.json'
import type { Email } from '../types'
import { COLUMNS, groupByType } from './board'
import { parseMasked } from './masked'

const emails = mockEmails as Email[]

describe('groupByType', () => {
  it('returns all five columns, even when empty', () => {
    expect(Object.keys(groupByType([]))).toEqual(COLUMNS.map((c) => c.type))
  })

  it('skips emails that have not been triaged', () => {
    const untriaged = { ...emails[0], triage: null }
    expect(Object.values(groupByType([untriaged])).flat()).toHaveLength(0)
  })

  it('sorts by urgency, then newest first', () => {
    const [a, b, c] = [emails[0], emails[0], emails[0]].map((e, i) => ({ ...e, id: String(i) }))
    const low = { ...a, triage: { ...a.triage!, urgency: 'Low' as const }, receivedAt: '2026-10-29T10:00:00Z' }
    const highOld = { ...b, triage: { ...b.triage!, urgency: 'High' as const }, receivedAt: '2026-10-27T10:00:00Z' }
    const highNew = { ...c, triage: { ...c.triage!, urgency: 'High' as const }, receivedAt: '2026-10-28T10:00:00Z' }
    expect(groupByType([low, highOld, highNew]).Task.map((e) => e.id)).toEqual(['2', '1', '0'])
  })
})

describe('parseMasked', () => {
  it('splits text around mask tokens', () => {
    expect(parseMasked('code [MASKED:otp] expires, key [MASKED:API_KEY].')).toEqual([
      { text: 'code ' },
      { secretType: 'otp' },
      { text: ' expires, key ' },
      { secretType: 'api_key' },
      { text: '.' },
    ])
  })

  it('leaves unmasked text alone', () => {
    expect(parseMasked('plain')).toEqual([{ text: 'plain' }])
  })
})

// Fixtures must look like real API output: secrets already masked by the server (FR-SEC-006).
describe('mock fixtures', () => {
  // Only human-readable text; ids and hashes would trip the digit patterns.
  const raw = emails
    .flatMap((e) => [e.subject, e.bodyText, e.mlText, e.summary?.oneLine ?? '', e.summary?.short ?? ''])
    .join('\n')
  it.each([
    ['AWS key', /AKIA[0-9A-Z]{16}/],
    ['JWT', /eyJ[\w-]+\.[\w-]+/],
    ['PEM block', /-----BEGIN/],
    // (?!\s|…) stops \s* backtracking past the space before a mask token
    ['labelled password', /\b(password|pwd|passcode)\s*[:=]\s*(?!\s|\[MASKED)/i],
    ['OTP next to keyword', /\b(code|otp)\b\D{0,20}\d{4,8}\b/i],
    ['card-length digit run', /\b(?:\d[ -]?){13,19}\b/],
  ])('contain no raw %s', (_, pattern) => {
    expect(raw).not.toMatch(pattern)
  })

  it('has 3 emails per column', () => {
    for (const list of Object.values(groupByType(emails))) expect(list).toHaveLength(3)
  })
})
