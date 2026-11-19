import * as Popover from '@radix-ui/react-popover'
import { AlarmClock, AlarmClockOff, CalendarClock } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { createReminder, deleteReminder, emailSnoozedUntil, emailSubject, updateEmail } from '../api/queries'
import { snoozeChoices, snoozeText } from '../reminders/snooze'
import { errorText, useInbox } from './inboxContext'
import type { PickerAt } from './ProjectPicker'

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

/**
 * Snooze / "Remind me" (FR-REM-002, decisions item 13): Later today, Tomorrow 9 am, Next week, Pick a time. The email
 * sinks below the column's "Snoozed · n" divider until then and comes back with ⏰. Undo clears the snooze.
 */
export function SnoozePicker({ at, onClose, container }: { at: PickerAt; onClose: () => void; container?: HTMLElement | null }) {
  const { toast } = useInbox()
  const ref = useRef<HTMLDivElement>(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => new Date())
  const n = at.ids.length
  const remind = !!at.remind
  const anySnoozed = !remind && at.ids.some((id) => {
    const t = emailSnoozedUntil(id)
    return t !== null && Date.parse(t) > now.getTime()
  })

  const apply = async (until: Date | null) => {
    setBusy(true)
    try {
      if (remind && until) {
        // "Remind me": the email stays where it is; a notification arrives at `until` (proposals §21).
        const made = await Promise.all(at.ids.map((id) => createReminder({ type: 'email', id }, emailSubject(id), until)))
        onClose()
        toast(`Reminder set for ${snoozeText(until, now)}`, 'info', {
          label: 'Undo',
          run: () => void Promise.all(made.map((r) => deleteReminder(r.id))).catch((err: unknown) => toast(errorText(err), 'error')),
        })
        return
      }
      await Promise.all(at.ids.map((id) => updateEmail(id, { snoozed_until: until ? until.toISOString() : null })))
      onClose()
      const what = n === 1 ? '' : `${n} emails `
      if (until) {
        toast(`Snoozed ${what}until ${snoozeText(until, now)}`, 'info', {
          label: 'Undo',
          run: () => void Promise.all(at.ids.map((id) => updateEmail(id, { snoozed_until: null }))).catch((err: unknown) => toast(errorText(err), 'error')),
        })
      } else toast(`${what ? what : 'Email '}back in the list`)
    } catch (err) {
      setBusy(false)
      toast(errorText(err), 'error')
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const go = (j: number) => (e.preventDefault(), items[(j + items.length) % items.length]?.focus())
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
  }

  return (
    <Popover.Root open onOpenChange={(o) => !o && onClose()}>
      <Popover.Anchor asChild>
        <div style={{ position: 'fixed', left: at.x, top: at.y, width: 0, height: 0 }} aria-hidden="true" />
      </Popover.Anchor>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          ref={ref}
          className="menu snooze-picker"
          role="menu"
          aria-label={remind ? 'Remind me' : n === 1 ? 'Snooze' : `Snooze ${n} emails`}
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ref.current?.querySelector<HTMLElement>('[role="menuitem"], input')?.focus()
          }}
        >
          <p className="menu-title">{remind || n === 1 ? 'Remind me' : `Snooze ${n} emails`}</p>
          {!picking &&
            snoozeChoices(now).map((c) => (
              <button key={c.id} type="button" role="menuitem" className="menu-item" disabled={busy} onClick={() => void apply(c.at)}>
                <AlarmClock size={14} aria-hidden="true" />
                <span className="menu-label">{c.label}</span>
                <span className="menu-keys">{snoozeText(c.at, now)}</span>
              </button>
            ))}
          {!picking && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => setPicking(true)}>
              <CalendarClock size={14} aria-hidden="true" />
              <span className="menu-label">Pick a time</span>
            </button>
          )}
          {picking && <PickTime label={remind ? 'Remind me' : 'Snooze'} min={localInput(new Date(now.getTime() + 60_000))} now={now} disabled={busy} onPick={(d) => void apply(d)} onBack={() => setPicking(false)} />}
          {anySnoozed && !picking && (
            <>
              <hr className="menu-sep" />
              <button type="button" role="menuitem" className="menu-item" disabled={busy} onClick={() => void apply(null)}>
                <AlarmClockOff size={14} aria-hidden="true" />
                <span className="menu-label">Remove snooze</span>
              </button>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function PickTime({ label, min, now, disabled, onPick, onBack }: { label: string; min: string; now: Date; disabled: boolean; onPick: (d: Date) => void; onBack: () => void }) {
  const [value, setValue] = useState('')
  const date = value ? new Date(value) : null
  const ok = date !== null && !Number.isNaN(date.getTime()) && date.getTime() > now.getTime()
  return (
    <div className="snooze-pick">
      <input type="datetime-local" aria-label="Remind me at" min={min} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      <div className="snooze-pick-row">
        <button type="button" className="text-button" onClick={onBack}>
          Back
        </button>
        <button type="button" className="ghost-button" disabled={disabled || !ok} onClick={() => ok && onPick(date)}>
          {label}
        </button>
      </div>
    </div>
  )
}
