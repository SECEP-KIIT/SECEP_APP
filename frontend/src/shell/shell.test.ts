import { describe, expect, it } from 'vitest'
import type { Glance, Me } from '../api/types'
import { computeGlance } from '../mocks/glance'
import { emails, me, notifications } from '../mocks/fixtures'
import { notificationText } from '../mocks/notifications'
import { toListItem } from '../mocks/fixtures'
import { focusKeyAction, isTypingTarget } from './focusKeys'
import { glanceLine, lockNotificationText } from './lockText'
import { NAV, visibleNav } from './nav'
import { resolvePrefs } from './prefs'

const key = (k: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: unknown }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: null,
  ...extra,
}) as Parameters<typeof focusKeyAction>[0]

describe('focus mode keys (FR-UI-004)', () => {
  it('F toggles, Esc exits only when focused', () => {
    expect(focusKeyAction(key('f'), false)).toBe('toggle')
    expect(focusKeyAction(key('F'), true)).toBe('toggle')
    expect(focusKeyAction(key('Escape'), true)).toBe('exit')
    expect(focusKeyAction(key('Escape'), false)).toBeNull()
  })

  it('ignores modifiers and typing', () => {
    expect(focusKeyAction(key('f', { ctrlKey: true }), false)).toBeNull()
    expect(focusKeyAction(key('f', { target: { tagName: 'INPUT' } }), false)).toBeNull()
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false)
  })
})

describe('nav gating (sidebar and tab bar share it)', () => {
  const user = { ...me, is_admin: false, permissions: [] } satisfies Me
  it('hides Security without security.review and Metrics without admin', () => {
    expect(visibleNav(user).map((i) => i.label)).toEqual(['Inbox', 'Board', 'Calendar'])
    expect(visibleNav(me).map((i) => i.label)).toEqual(NAV.map((i) => i.label))
  })
  it('shows only ungated items before /me arrives', () => {
    expect(visibleNav(undefined).map((i) => i.label)).toEqual(['Inbox', 'Board', 'Calendar'])
  })
})

describe('resolvePrefs', () => {
  it('defaults, and drops wrongly typed values', () => {
    expect(resolvePrefs({})).toEqual({ motion: undefined, skip_lock: false, idle_minutes: 15, glance_subjects: false, sidebar_collapsed: false })
    expect(resolvePrefs({ motion: 'wild', skip_lock: 'yes', idle_minutes: null })).toMatchObject({ motion: undefined, skip_lock: false, idle_minutes: null })
  })
})

// Lock-screen privacy (FR-WP-001): a passer-by sees counts, never senders, subjects or item titles, unless the user
// opted in with glance_subjects.
describe('lock-screen privacy', () => {
  const sensitive = [
    ...emails.flatMap((e) => [e.subject ?? '', e.from.name ?? '', e.from.address]),
    'Onboarding flow design review',
    'Collect Q3 churn figures',
    'ATL-141',
  ].filter(Boolean)

  it('notification titles never carry a sender, subject or item title', () => {
    for (const n of notifications) for (const s of sensitive) expect(n.title).not.toContain(s)
    const critical = notificationText({ kind: 'new_email', email: toListItem(emails[0]) })
    expect(critical.title).toBe('New Critical email')
    expect(critical.body).toContain('R. Sen')
  })

  it('the lock shows notification bodies only with glance_subjects', () => {
    expect(lockNotificationText(notifications[0], false).body).toBeNull()
    expect(lockNotificationText(notifications[0], true).body).toContain('R. Sen')
  })

  it('glance hides event titles and subjects unless opted in', () => {
    const now = new Date('2026-11-04T10:00:00Z')
    const off = computeGlance(emails, new Set(), {}, true, now)
    expect(off.next_event?.title).toBeNull()
    expect(off.subjects).toBeNull()
    const line = glanceLine(off, now)
    for (const s of sensitive) expect(line).not.toContain(s)

    const on = computeGlance(emails, new Set(), { glance_subjects: true }, true, now)
    expect(on.next_event?.title).toBe('Onboarding flow design review')
    expect(on.subjects).toContain(emails[0].subject)
  })

  it('security_flags count is withheld without security.review', () => {
    expect(computeGlance(emails, new Set(), {}, false, new Date()).counts.security_flags).toBeNull()
  })

  it('formats the glance line from counts', () => {
    const g: Glance = {
      counts: { inbox_unread: 5, critical_unread: 3, board_todo: 0, due_today: 5, overdue: 0, security_flags: 1 },
      next_event: { title: null, start: '2026-11-04T11:00:00' },
      subjects: null,
    }
    expect(glanceLine(g, new Date('2026-11-04T09:00:00'))).toMatch(/^3 Critical · Next event · .+ · 5 due today$/)
  })
})
