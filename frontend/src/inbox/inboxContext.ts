import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import type { ActionType } from '../api/types'

export interface OpenOptions {
  /** Open the drawer with the composer for this action type (⇧-click, or no proposal to send as is). */
  compose?: Exclude<ActionType, 'add_board_card'>
}

/** A toast's one button, e.g. Undo (the FR-UI-029 pattern). Running it dismisses the toast. */
export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
  action?: ToastAction
}

/** What cards can ask the inbox page to do: open the drawer, show a toast. */
export interface InboxApi {
  open: (id: string, opts?: OpenOptions) => void
  toast: (message: string, tone?: Toast['tone'], action?: ToastAction) => void
  /** The `?` legend (FR-UI-014), one per page however many columns it has. */
  showLegend: () => void
}

export const InboxContext = createContext<InboxApi>({ open: () => {}, toast: () => {}, showLegend: () => {} })
export const useInbox = () => useContext(InboxContext)

const TOAST_MS = 5_000
/** An undo stays offered for about 10 s (FR-UI-029). */
export const UNDO_MS = 10_000

/** A small toast queue. A toast with an action (Undo) stays for UNDO_MS. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (message: string, tone: Toast['tone'] = 'info', action?: ToastAction) => {
      const id = ++next.current
      setToasts((t) => [...t.slice(-2), { id, message, tone, action }])
      setTimeout(() => dismiss(id), action ? UNDO_MS : TOAST_MS)
    },
    [dismiss],
  )
  return { toasts, push, dismiss }
}

/** User-facing text for an API failure. Never shows email content; server messages never contain any (§6.4.1). */
export function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Check your connection and try again.'
  switch (err.code) {
    case 'upstream_error':
      return 'Jira is unavailable right now. The action is marked failed; retry it from the details.'
    case 'conflict':
      return 'That changed in the meantime. The details show its current state.'
    case 'action_invalid':
    case 'validation_failed':
      return 'Some fields need fixing before this can be sent.'
    case 'not_found':
      return 'This email is no longer available.'
    default:
      return err.message
  }
}
