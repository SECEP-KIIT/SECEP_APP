// Snooze / "Remind me" choices (FR-REM-002, decisions item 13): Later today, Tomorrow 9 am, Next week, Pick a time.
import type { EmailListItem } from '../api/types'

export interface SnoozeChoice {
  id: 'later' | 'tomorrow' | 'week'
  label: string
  at: Date
}

const at = (base: Date, days: number, hour: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

/**
 * The quick choices from `now`. "Later today" is 3 hours on, rounded to the half hour, and only offered while it is
 * still today. "Next week" is the coming Monday at 9 am.
 */
export function snoozeChoices(now: Date): SnoozeChoice[] {
  const out: SnoozeChoice[] = []
  const later = new Date(now.getTime() + 3 * 3_600_000)
  later.setMinutes(later.getMinutes() < 30 ? 30 : 60, 0, 0)
  if (later.toDateString() === now.toDateString()) out.push({ id: 'later', label: 'Later today', at: later })
  out.push({ id: 'tomorrow', label: 'Tomorrow 9 am', at: at(now, 1, 9) })
  const toMonday = ((8 - now.getDay()) % 7) || 7
  out.push({ id: 'week', label: 'Next week', at: at(now, toMonday, 9) })
  return out
}

/** Snoozed until a time still ahead. */
export const isSnoozed = (e: Pick<EmailListItem, 'snoozed_until'>, now: Date) => !!e.snoozed_until && Date.parse(e.snoozed_until) > now.getTime()

/** The loaded cards in their normal order, then the snoozed ones (FR-REM-002: they sink to the bottom of the column). */
export function splitSnoozed<T extends Pick<EmailListItem, 'snoozed_until'>>(items: readonly T[], now: Date) {
  const active: T[] = []
  const snoozed: T[] = []
  for (const e of items) (isSnoozed(e, now) ? snoozed : active).push(e)
  return { active, snoozed }
}

/** "Mon 9:00" or "Today 15:30" style text for toasts and tooltips. */
export function snoozeText(when: Date, now: Date) {
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (when.toDateString() === now.toDateString()) return `today ${time}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (when.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`
  return `${when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}
