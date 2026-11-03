import { CalendarPlus, CircleCheck, Ellipsis, Undo2, Zap } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { acceptAction, emailDetailOptions, queryClient, updateEmail } from '../api/queries'
import type { EmailListItem } from '../api/types'
import { errorText, useInbox, type OpenOptions } from './inboxContext'
import { useLift } from './liftContext'

type Busy = 'jira' | 'calendar' | 'done' | null

/** Matches the card fade in inbox.css: the card fades, then leaves the list (item 9 "card removal"). */
const LEAVE_MS = 120

/**
 * Card layer 2 (FR-UI-011, item 3): Jira · Calendar · Done · ⋯, in the bar above a lifted card (CardLift, QA pass 3),
 * never changing the card's height. Touch has no hover: a tap opens the drawer instead.
 *
 * Jira and Calendar send the decoder's proposal as is (FR-ORC-012). Shift+click, or no proposal to send, opens the
 * drawer's composer. Done marks the email handled (proposals §10.3); in the Handled view it restores it.
 */
export function CardActions({ email, onLeave }: { email: EmailListItem; onLeave: (leaving: boolean) => void }) {
  const { open: openDrawer, toast } = useInbox()
  const lift = useLift()
  // Opening the drawer drops the lift the actions sit in.
  const open: typeof openDrawer = (id, opts) => {
    lift?.hide()
    openDrawer(id, opts)
  }
  const [busy, setBusy] = useState<Busy>(null)

  const send = (type: NonNullable<OpenOptions['compose']>) => async (e: MouseEvent) => {
    e.stopPropagation()
    if (e.shiftKey) return open(email.id, { compose: type })
    setBusy(type === 'create_jira_issue' ? 'jira' : 'calendar')
    try {
      const detail = await queryClient.fetchQuery(emailDetailOptions(email.id))
      const proposal = detail.actions.find((a) => a.type === type && (a.status === 'proposed' || a.status === 'failed'))
      if (!proposal) return open(email.id, { compose: type })
      const result = await acceptAction(proposal)
      if (result.status === 'done') toast(type === 'create_jira_issue' ? `Sent to Jira as ${result.external_ref}` : 'Added to your calendar')
      else toast(`Couldn't send it: ${result.error ?? 'the action failed'}. Retry from the details.`, 'error')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handled = async (e: MouseEvent) => {
    e.stopPropagation()
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

  return (
    <div className="card-actions" role="group" aria-label="Quick actions">
      {email.jira_key ? (
        <span className="card-action card-action-done" title={`Jira issue ${email.jira_key}`}>
          <CircleCheck size={14} aria-hidden="true" />
          {email.jira_key}
        </span>
      ) : (
        <button
          type="button"
          className="card-action"
          aria-busy={busy === 'jira' || undefined}
          disabled={busy !== null}
          title="Send to Jira (Shift+click to edit first)"
          onClick={send('create_jira_issue')}
        >
          <Zap size={14} aria-hidden="true" />
          Jira
        </button>
      )}
      <button
        type="button"
        className="card-action"
        aria-busy={busy === 'calendar' || undefined}
        disabled={busy !== null}
        title="Add to calendar (Shift+click to edit first)"
        onClick={send('add_calendar_event')}
      >
        <CalendarPlus size={14} aria-hidden="true" />
        Calendar
      </button>
      <button
        type="button"
        className="card-action"
        aria-busy={busy === 'done' || undefined}
        disabled={busy !== null}
        title={email.handled ? 'Restore to the inbox' : 'Mark as handled'}
        onClick={handled}
      >
        {email.handled ? <Undo2 size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
        {email.handled ? 'Restore' : 'Done'}
      </button>
      <button
        type="button"
        className="card-action card-action-icon"
        title="Open details"
        onClick={(e) => {
          e.stopPropagation()
          open(email.id)
        }}
      >
        <Ellipsis size={14} aria-hidden="true" />
        <span className="sr-only">Open details</span>
      </button>
    </div>
  )
}
