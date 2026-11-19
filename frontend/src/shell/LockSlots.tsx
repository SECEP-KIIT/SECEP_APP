import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGlance } from '../api/queries'
import { glanceParts } from './lockText'
import { subjectsShown } from './lockSubjects'


/** Renders the glance chips and subjects into the static lock screen's slot (index.html). Recent notification cards
 * were removed (19 Nov 2026): the chips and the Critical unread card are enough. */
export function LockSlots() {
  const { data: glance } = useGlance()
  // Only used to tell "today" from another day in the glance line; glance itself refetches.
  const [now] = useState(() => new Date())
  const glanceEl = document.getElementById('lock-glance')

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
    </>
  )
}

