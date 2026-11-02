import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import type { ActionType } from '../api/types'

export interface OpenOptions {
  /** Open the drawer with the composer for this action type (⇧-click, or no proposal to send as is). */
  compose?: Exclude<ActionType, 'add_board_card'>
}

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

/** What cards can ask the inbox page to do: open the drawer, show a toast. */
export interface InboxApi {
  open: (id: string, opts?: OpenOptions) => void
  toast: (message: string, tone?: Toast['tone']) => void
}

export const InboxContext = createContext<InboxApi>({ open: () => {}, toast: () => {} })
export const useInbox = () => useContext(InboxContext)

const TOAST_MS = 5_000

/** A small toast queue. Undo toasts (FR-UI-029) extend it with the interactions (task 9). */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = ++next.current
      setToasts((t) => [...t.slice(-2), { id, message, tone }])
      setTimeout(() => dismiss(id), TOAST_MS)
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
