import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGlance, useNotifications } from '../api/queries'
import { glanceLine, lockNotificationText } from './lockText'
import { usePrefs } from './prefs'
import { subjectsShown } from './lockSubjects'

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const RECENT = 3

/** Renders the glance line and recent notifications into the static lock screen's slots (index.html). */
export function LockSlots() {
  const { data: glance } = useGlance()
  const { data: notes } = useNotifications()
  const { glance_subjects } = usePrefs()
  // Only used to tell "today" from another day in the glance line; glance itself refetches.
  const [now] = useState(() => new Date())
  const glanceEl = document.getElementById('lock-glance')
  const notesEl = document.getElementById('lock-notes')

  return (
    <>
      {glanceEl &&
        glance &&
        createPortal(
          <>
            <span>{glanceLine(glance, now)}</span>
            {/* Opted-in subjects: three distinct ones at most, so the clock stays the lock screen's focus. */}
            {subjectsShown(glance.subjects).shown.map((s) => (
              <span key={s} className="lock-subject">
                {s}
              </span>
            ))}
            {subjectsShown(glance.subjects).more > 0 && <span className="lock-subject lock-more">and {subjectsShown(glance.subjects).more} more</span>}
          </>,
          glanceEl,
        )}
      {notesEl &&
        notes &&
        createPortal(
          notes.items.slice(0, RECENT).map((n) => {
            const { title, body } = lockNotificationText(n, glance_subjects)
            return (
              <li key={n.id} className="lock-note">
                <span className="lock-note-title">{title}</span>
                {body && <span className="lock-note-body">{body}</span>}
                <time dateTime={n.created_at}>{timeFmt.format(new Date(n.created_at))}</time>
              </li>
            )
          }),
          notesEl,
        )}
    </>
  )
}

