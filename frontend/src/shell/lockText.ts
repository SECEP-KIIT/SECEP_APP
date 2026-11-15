import type { AppNotification, Glance } from '../api/types'

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dayTimeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/**
 * "3 Critical · Next event · 11:00 · 5 due today". With glance_subjects off the server sends no event title, so the
 * line says something is coming without saying what (FR-WP-001).
 */
export function glanceLine(g: Glance, now: Date): string {
  const parts: string[] = []
  if (g.counts.critical_unread) parts.push(`${g.counts.critical_unread} Critical`)
  if (g.next_event) {
    const start = new Date(g.next_event.start)
    parts.push(g.next_event.title ? `Next: ${g.next_event.title}` : 'Next event')
    parts.push((sameDay(start, now) ? timeFmt : dayTimeFmt).format(start))
  }
  if (g.counts.due_today) parts.push(`${g.counts.due_today} due today`)
  if (g.counts.overdue) parts.push(`${g.counts.overdue} overdue`)
  return parts.length ? parts.join(' · ') : 'All clear'
}

/**
 * What the lock screen may show of a notification. By default only the generic title (no sender, subject or item
 * title), because the lock is what a passer-by sees. The body only with glance_subjects (FR-WP-001).
 */
export function lockNotificationText(n: AppNotification, showDetails: boolean) {
  return { title: n.title, body: showDetails ? n.body : null }
}
