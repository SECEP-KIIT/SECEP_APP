// GET /me/glance, computed the way M6 would (server role; PROPOSED shape, pending SRS v1.3).
// Read state is mock-internal here, not a wire field. See the read_at note in docs/proposals/srs-v1.3-frontend-shapes.md.
import type { DecoderActionPayload, EmailDetail, Glance, UiPrefs } from '../api/types'

const day = (iso: string) => iso.slice(0, 10)

export function computeGlance(
  emails: EmailDetail[],
  readIds: ReadonlySet<string>,
  prefs: UiPrefs,
  canReviewSecurity: boolean,
  now: Date,
): Glance {
  const unread = emails.filter((e) => !readIds.has(e.id))
  const criticalUnread = unread.filter((e) => e.triage?.urgency.label === 'Critical')
  const actions = emails.flatMap((e) => e.actions).filter((a) => a.status !== 'rejected')
  const dueDates = actions
    .filter((a) => a.status !== 'done')
    .map((a) => (a.payload as DecoderActionPayload).due_date)
    .filter((d): d is string => !!d)
  const today = day(now.toISOString())

  const next = actions
    .map((a) => a.payload as DecoderActionPayload)
    .filter((p) => p.start && Date.parse(p.start) > now.getTime())
    .sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!))[0]

  // Lock-screen privacy (FR-WP-001): titles and subjects only when the user opted in.
  const details = prefs.glance_subjects === true

  return {
    counts: {
      inbox_unread: unread.length,
      critical_unread: criticalUnread.length,
      board_todo: actions.filter((a) => a.board_column === 'todo').length,
      due_today: dueDates.filter((d) => d === today).length,
      overdue: dueDates.filter((d) => d < today).length,
      security_flags: canReviewSecurity ? emails.filter((e) => e.security_flag !== 'none').length : null,
    },
    next_event: next ? { title: details ? next.title : null, start: next.start! } : null,
    subjects: details ? criticalUnread.map((e) => e.subject ?? '(no subject)') : null,
  }
}
