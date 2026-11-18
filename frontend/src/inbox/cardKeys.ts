// Card keyboard shortcuts (FR-UI-028, item 8). Pure mapping, unit-tested; EmailCard runs the result.
import type { EmailListItem } from '../api/types'
import type { InboxApi } from './inboxContext'

export type CardKey = 'next' | 'prev' | 'select' | 'done' | 'jira' | 'calendar' | 'copy' | 'menu' | 'project' | null

interface KeyLike {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

/** j/k move, x selects, e handles, p files in a project, ⇧J/⇧C send, Ctrl/⌘+C copies, Shift+F10 or the menu key opens the menu. */
export function cardKeyAction(e: KeyLike): CardKey {
  const mod = e.ctrlKey || e.metaKey
  if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'c') return 'copy'
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) return 'menu'
  if (mod || e.altKey) return null
  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      return 'next'
    case 'k':
    case 'ArrowUp':
      return 'prev'
    case 'x':
      return 'select'
    case 'e':
      return 'done'
    case 'p':
      return 'project'
    case 'J':
      return 'jira'
    case 'C':
      return 'calendar'
    default:
      return null
  }
}

/** Ctrl/⌘+C on a card: subject and one-line summary. Both are already masked by the server (FR-SEC-006). */
export function copySummary(email: EmailListItem, toast: InboxApi['toast']) {
  const text = [email.subject || '(no subject)', email.summary_one_line].filter(Boolean).join(' — ')
  navigator.clipboard?.writeText(text).then(
    () => toast('Summary copied'),
    () => toast("Couldn't copy to the clipboard", 'error'),
  )
}
