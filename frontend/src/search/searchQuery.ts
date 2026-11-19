import type { EmailType, EmailView, Urgency } from '../api/types'

export const TYPES: EmailType[] = ['Task', 'Meeting', 'Approval', 'Info', 'Credentials']
export const URGENCIES: Urgency[] = ['Critical', 'High', 'Medium', 'Low']
export const VIEWS: { key: EmailView; label: string }[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'due_today', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
]
export const MAX = 8

export interface Filters {
  type: EmailType[]
  urgency: Urgency[]
  view: EmailView[]
  includeHandled: boolean
}
export const NO_FILTERS: Filters = { type: [], urgency: [], view: [], includeHandled: true }
export const filterCount = (f: Filters) => f.type.length + f.urgency.length + f.view.length + (f.includeHandled ? 0 : 1)

/**
 * GET /emails query for the palette. Subjects first (q_in=subject, proposals §26); "Go deeper" searches the masked
 * body too (q_in=all). Handled mail is left out of the default inbox list, so it's asked for separately with
 * view=handled and merged, newest first.
 */
export function searchQueries(q: string, f: Filters, deep: boolean): string[] {
  const base = new URLSearchParams({ limit: String(MAX), sort: 'newest' })
  if (q) {
    base.set('q', q)
    base.set('q_in', deep ? 'all' : 'subject')
  }
  if (f.type.length) base.set('type', f.type.join(','))
  if (f.urgency.length) base.set('urgency', f.urgency.join(','))
  const open = new URLSearchParams(base)
  if (f.view.length) open.set('view', f.view.join(','))
  const out = [`/emails?${open}`]
  // Handled mail can't be unread, due today or overdue in the inbox sense, so only plain searches include it.
  if (f.includeHandled && f.view.length === 0) {
    const handled = new URLSearchParams(base)
    handled.set('view', 'handled')
    out.push(`/emails?${handled}`)
  }
  return out
}

/** Subject text split around the query's words, so matches render as <mark> (plain text only, never HTML). */
export function highlight(text: string, q: string): { text: string; hit: boolean }[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const hits = new Array<boolean>(text.length).fill(false)
  for (const t of terms) for (let i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + 1)) hits.fill(true, i, i + t.length)
  const out: { text: string; hit: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1]
    if (last && last.hit === hits[i]) last.text += text[i]
    else out.push({ text: text[i], hit: hits[i] })
  }
  return out
}

