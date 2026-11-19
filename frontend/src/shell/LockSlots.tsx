import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGlance, useNotifications } from '../api/queries'
import { glanceParts, lockNotificationText } from './lockText'
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
            {/* One frosted chip per fact, so the line reads at a glance over any wallpaper. */}
            <span className="lock-chips">
              {glanceParts(glance, now).length === 0 ? (
                <span className="lock-chip">All clear</span>
              ) : (
                glanceParts(glance, now).map((p) => (
                  <span key={p.key} className="lock-chip" data-kind={p.key}>
                    {p.text}
                    {p.detail && <span className="lock-chip-detail">{p.detail}</span>}
                  </span>
                ))
              )}
            </span>
            {/* Opted-in subjects: three distinct ones at most, in one card under a heading. */}
            {subjectsShown(glance.subjects).shown.length > 0 && (
              <span className="lock-subjects">
                <span className="lock-subjects-head">Critical unread</span>
                {subjectsShown(glance.subjects).shown.map((s) => (
                  <span key={s} className="lock-subject">
                    {s}
                  </span>
                ))}
                {subjectsShown(glance.subjects).more > 0 && <span className="lock-more">and {subjectsShown(glance.subjects).more} more</span>}
              </span>
            )}
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

