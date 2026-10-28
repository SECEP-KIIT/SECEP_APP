import type { Email, EmailType, Urgency } from '../types'

export const COLUMNS: { type: EmailType; label: string }[] = [
  { type: 'Task', label: 'Tasks' },
  { type: 'Info', label: 'Info' },
  { type: 'Credentials', label: 'Credentials' },
  { type: 'Meeting', label: 'Meetings' },
  { type: 'Approval', label: 'Approval' },
]

const URGENCY_RANK: Record<Urgency, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

// Most urgent first, then newest first (FR-ORC-008).
export function sortCards(a: Email, b: Email) {
  return (
    URGENCY_RANK[a.triage!.urgency] - URGENCY_RANK[b.triage!.urgency] ||
    Date.parse(b.receivedAt) - Date.parse(a.receivedAt)
  )
}

// Untriaged emails have no type yet, so they don't belong on any column.
export function groupByType(emails: Email[]) {
  const groups = Object.fromEntries(COLUMNS.map((c) => [c.type, [] as Email[]])) as Record<EmailType, Email[]>
  for (const e of emails) if (e.triage) groups[e.triage.emailType].push(e)
  for (const list of Object.values(groups)) list.sort(sortCards)
  return groups
}
