import { memo, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { EmailListItem } from '../api/types'
import type { Density, FilterPatch } from './cardModel'
import { CardBody } from './CardBody'
import { useInbox } from './inboxContext'
import { canLift, useLift, type LiftTarget } from './liftContext'

interface Props {
  email: EmailListItem
  now: Date
  density: Density
  /** Arrived through the "↑ n new" pill: fades in with an accent tint for 2 s (item 9). */
  fresh: boolean
  onFilter: (patch: FilterPatch) => void
}

/**
 * A card in a column (FR-UI-011, item 3). Layer 1 is CardBody. Its height is fixed by its density (NFR-PERF-011):
 * every line truncates, and the summary and labels reserve their space while they load.
 *
 * Layer 2, desktop: the hover lift (CardLift). After the hover intent, or on keyboard focus, a floating copy shows
 * the quick actions above the card and every tag below it, in a portal; this card never changes. Touch has no lift:
 * a tap opens the drawer (FR-UI-009). Layer 3: a click, Enter or Space opens the side drawer (Space is the quick
 * preview, FR-UI-015). Buttons inside the card stop their clicks, so they never also open the drawer.
 */
export const EmailCard = memo(function EmailCard({ email, now, density, fresh, onFilter }: Props) {
  // Per card instance: the same email can sit in several columns on one dashboard page.
  const subjectId = useId()
  const { open } = useInbox()
  const lift = useLift()
  const ref = useRef<HTMLElement>(null)
  const [leaving, setLeaving] = useState(false)
  const filter = (patch: FilterPatch) => (e: ReactMouseEvent) => {
    e.stopPropagation()
    onFilter(patch)
  }
  const target = (): LiftTarget | null => (ref.current ? { el: ref.current, email, now, density, onFilter, onLeave: setLeaving } : null)

  // A live update while lifted shows in the lift too.
  useEffect(() => {
    const t = ref.current && { el: ref.current, email, now, density, onFilter, onLeave: setLeaving }
    if (t && lift?.isLifted(email.id)) lift.refresh(t)
  }, [lift, email, now, density, onFilter])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      lift?.hide()
      open(email.id)
    } else if (e.key === 'Tab' && !e.shiftKey && lift?.isLifted(email.id) && lift.enterBar()) {
      // Tab goes to the lifted quick actions next, then on through the card (CardLift).
      e.preventDefault()
    }
  }

  return (
    <article
      ref={ref}
      className="card"
      data-density={density}
      data-fresh={fresh || undefined}
      data-leaving={leaving || undefined}
      aria-labelledby={subjectId}
      aria-describedby="card-hint"
      tabIndex={0}
      onClick={() => {
        lift?.hide()
        open(email.id)
      }}
      onKeyDown={onKeyDown}
      onPointerEnter={(e) => {
        const t = e.pointerType === 'mouse' && canLift() ? target() : null
        if (t) lift?.enter(t)
      }}
      onPointerLeave={() => lift?.leave()}
      onFocus={(e) => {
        // Keyboard focus on the card itself lifts it; focus on a button inside it shows that button instead.
        const t = e.target === e.currentTarget && e.currentTarget.matches(':focus-visible') && canLift() ? target() : null
        if (t) lift?.focus(t)
        else if (lift?.isLifted(email.id)) lift.hide()
      }}
      onBlur={(e) => {
        if (e.target === e.currentTarget) lift?.blur(email.id, e.relatedTarget)
      }}
    >
      <CardBody email={email} now={now} subjectId={subjectId} filter={filter} />
    </article>
  )
})
