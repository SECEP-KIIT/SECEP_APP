import { useState } from 'react'
import { acceptAction, emailDetailOptions, queryClient, updateEmail } from '../api/queries'
import type { EmailListItem } from '../api/types'
import { errorText, useInbox, type OpenOptions } from './inboxContext'
import { useLift } from './liftContext'

export type Busy = 'jira' | 'calendar' | 'done' | 'pin' | null
type Compose = NonNullable<OpenOptions['compose']>

/** Matches the card fade in inbox.css: the card fades, then leaves the list (item 9 "card removal"). */
const LEAVE_MS = 120

/**
 * The card's quick actions (FR-UI-011 layer 2), shared by the hover bar (desktop) and the long-press menu (touch).
 * Jira and Calendar send the decoder's proposal as is (FR-ORC-012); `edit`, or no proposal to send, opens the
 * drawer's composer instead. Done marks the email handled (proposals §10.3); in the Handled view it restores it.
 * Pin is PATCH /emails/:id {pinned} (FR-UI-029).
 */
export function useQuickActions(email: EmailListItem, onLeave: (leaving: boolean) => void) {
  const { open: openDrawer, toast } = useInbox()
  const lift = useLift()
  const [busy, setBusy] = useState<Busy>(null)
  // Opening the drawer drops the lift or menu the actions sit in.
  const open = (opts?: OpenOptions) => {
    lift?.hide()
    openDrawer(email.id, opts)
  }

  const send = async (type: Compose, edit = false) => {
    if (edit) return open({ compose: type })
    setBusy(type === 'create_jira_issue' ? 'jira' : 'calendar')
    try {
      const detail = await queryClient.fetchQuery(emailDetailOptions(email.id))
      const proposal = detail.actions.find((a) => a.type === type && (a.status === 'proposed' || a.status === 'failed'))
      if (!proposal) return open({ compose: type })
      const result = await acceptAction(proposal)
      if (result.status === 'done') toast(type === 'create_jira_issue' ? `Sent to Jira as ${result.external_ref}` : 'Added to your calendar')
      else toast(`Couldn't send it: ${result.error ?? 'the action failed'}. Retry from the details.`, 'error')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const toggleHandled = async () => {
    setBusy('done')
    onLeave(true)
    try {
      await Promise.all([updateEmail(email.id, { handled: !email.handled }), new Promise((r) => setTimeout(r, LEAVE_MS))])
      toast(email.handled ? 'Back in the inbox' : 'Marked as handled. Find it under Handled.')
    } catch (err) {
      onLeave(false)
      toast(errorText(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const togglePin = async () => {
    setBusy('pin')
    try {
      await updateEmail(email.id, { pinned: !email.pinned })
      toast(email.pinned ? 'Unpinned' : 'Pinned')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return { busy, send, toggleHandled, togglePin, open }
}
