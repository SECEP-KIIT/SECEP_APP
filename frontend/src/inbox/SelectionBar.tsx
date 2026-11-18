import { CalendarPlus, CircleCheck, X, Zap } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useBulk } from './bulk'
import { useSelection } from './selection'

/**
 * The topbar's contextual mode (FR-UI-001, item 1): with cards selected, the centre reads
 * `3 selected · Jira · Calendar · Done · ✕` instead of the search pill. Rendered into the topbar's slot.
 */
export function SelectionBar() {
  const { selected, clear } = useSelection()
  const bulk = useBulk()
  const [busy, setBusy] = useState(false)
  const slot = document.getElementById('topbar-context')
  if (!slot || selected.size === 0) return null
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  return createPortal(
    <div className="selection-bar" role="toolbar" aria-label="Selected emails">
      <span className="selection-count" aria-live="polite">
        {selected.size} selected
      </span>
      <button type="button" className="selection-action" disabled={busy} onClick={run(() => bulk.send('create_jira_issue'))} title="A separate Jira issue for each">
        <Zap size={14} aria-hidden="true" /> Jira
      </button>
      <button type="button" className="selection-action" disabled={busy} onClick={run(() => bulk.send('add_calendar_event'))} title="A separate event for each">
        <CalendarPlus size={14} aria-hidden="true" /> Calendar
      </button>
      <button type="button" className="selection-action" disabled={busy} onClick={run(bulk.done)}>
        <CircleCheck size={14} aria-hidden="true" /> Done
      </button>
      <button type="button" className="selection-clear" onClick={clear} aria-label="Clear selection" title="Clear selection (Esc)">
        <X size={14} aria-hidden="true" />
      </button>
    </div>,
    slot,
  )
}
