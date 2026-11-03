import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type MutableRefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cardTags, type FilterPatch } from './cardModel'
import { CardActions } from './CardActions'
import { CardBody, Tag } from './CardBody'
import { LiftContext, placeLift, type LiftApi, type LiftPlace, type LiftTarget } from './liftContext'

/** Hover intent before a card lifts (item 3, the same 150 ms as every hover reveal). */
const HOVER_INTENT_MS = 150
/** Grace for moving the pointer between the card and its bar or tags. */
const LEAVE_GRACE_MS = 120
const GAP = 4
const MARGIN = 8
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The hover lift (FR-UI-011 layer 2, QA pass 3), one per inbox page. On hover after the intent delay, or keyboard
 * focus, the card lifts into a floating copy in a portal: Jira · Calendar · Done · ⋯ above it, every tag below it.
 *
 * - The copy covers its neighbours but never pushes them; the card in the list never changes (NFR-PERF-011).
 * - The portal sits outside the virtual list's scroller, so nothing clips it. The bar and the tags flip to the
 *   other side when there's no room.
 * - The raised card itself lets the pointer through: clicks and wheel scrolling still reach the real card and its
 *   column. Any scroll or resize drops the lift.
 * - Keyboard: Tab from a focused card enters the bar; Tab past it continues after the card; Shift+Tab returns to the
 *   card; Esc closes the bar.
 */
export function CardLiftProvider({ children }: { children: ReactNode }) {
  const [lifted, setLifted] = useState<{ target: LiftTarget; rect: DOMRect } | null>(null)
  const current = useRef<LiftTarget | null>(null)
  const showTimer = useRef(0)
  const hideTimer = useRef(0)
  const root = useRef<HTMLDivElement | null>(null)

  const hide = useCallback(() => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
    current.current = null
    setLifted(null)
  }, [])
  const show = useCallback((target: LiftTarget) => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
    if (!target.el.isConnected) return
    current.current = target
    setLifted({ target, rect: target.el.getBoundingClientRect() })
  }, [])

  const api = useMemo<LiftApi>(
    () => ({
      enter(target) {
        clearTimeout(hideTimer.current)
        if (current.current?.email.id === target.email.id) return
        clearTimeout(showTimer.current)
        showTimer.current = window.setTimeout(() => show(target), HOVER_INTENT_MS)
      },
      leave() {
        clearTimeout(showTimer.current)
        clearTimeout(hideTimer.current)
        hideTimer.current = window.setTimeout(hide, LEAVE_GRACE_MS)
      },
      focus: show,
      blur(id, next) {
        if (current.current?.email.id !== id || (next instanceof Node && root.current?.contains(next))) return
        hide()
      },
      refresh(target) {
        if (current.current?.email.id !== target.email.id) return
        current.current = target
        setLifted((l) => l && { ...l, target })
      },
      isLifted: (id) => current.current?.email.id === id,
      enterBar() {
        const first = root.current?.querySelector<HTMLElement>('.lift-bar button:not([disabled])')
        first?.focus()
        return !!first
      },
      hide,
    }),
    [hide, show],
  )

  // The lift is placed for one scroll position and one window size.
  useEffect(() => {
    if (!lifted) return
    const drop = (e: Event) => {
      if (e.type === 'scroll' && e.target instanceof Node && root.current?.contains(e.target)) return
      hide()
    }
    addEventListener('scroll', drop, true)
    addEventListener('resize', drop)
    return () => {
      removeEventListener('scroll', drop, true)
      removeEventListener('resize', drop)
    }
  }, [lifted, hide])

  return (
    <LiftContext.Provider value={api}>
      {children}
      {lifted &&
        createPortal(
          <Lift
            key={lifted.target.email.id}
            target={lifted.target}
            rect={lifted.rect}
            rootRef={root}
            onPointerEnter={() => clearTimeout(hideTimer.current)}
            onPointerLeave={api.leave}
            onClose={hide}
          />,
          document.body,
        )}
    </LiftContext.Provider>
  )
}

interface Place extends LiftPlace {
  barH: number
}

function Lift({ target, rect, rootRef, onPointerEnter, onPointerLeave, onClose }: {
  target: LiftTarget
  rect: DOMRect
  rootRef: MutableRefObject<HTMLDivElement | null>
  onPointerEnter: () => void
  onPointerLeave: () => void
  onClose: () => void
}) {
  const { email, now, density, el } = target
  const tags = cardTags(email, now)
  const barRef = useRef<HTMLDivElement>(null)
  const tagsRef = useRef<HTMLUListElement>(null)
  const [place, setPlace] = useState<Place | null>(null)

  // Flip where there's no room: the bar goes below the card, the tags above it.
  useLayoutEffect(() => {
    const barH = barRef.current?.offsetHeight ?? 0
    const tagsH = tagsRef.current?.offsetHeight ?? 0
    setPlace({ ...placeLift(rect, barH, tagsH, innerHeight, GAP, MARGIN), barH })
  }, [rect, tags.length])

  const filter = (p: FilterPatch) => (e: MouseEvent) => {
    e.stopPropagation()
    target.onFilter(p)
  }
  const tagsOffset = place && place.bar === place.tags ? place.barH + GAP : 0

  // Keyboard inside the bar: Tab past the end continues after the card, Shift+Tab before the start returns to it.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      el.focus()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>(TABBABLE) ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.shiftKey && i === 0) {
      e.preventDefault()
      el.focus()
    } else if (!e.shiftKey && i === items.length - 1) {
      e.preventDefault()
      onClose()
      nextTabbable(el)?.focus()
    }
  }

  return (
    <div
      ref={rootRef}
      className="card-lift"
      data-placed={place ? '' : undefined}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node) || (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== el)) onClose()
      }}
    >
      {/* The raised copy: looks like the card, lets the pointer through to it, never takes focus. */}
      <div className="card lift-card" data-density={density} aria-hidden="true" ref={(n) => n?.setAttribute('inert', '')}>
        <CardBody email={email} now={now} subjectId={undefined} filter={filter} />
      </div>
      <div
        ref={barRef}
        className="lift-bar"
        data-place={place?.bar ?? 'above'}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <CardActions email={email} onLeave={(leaving) => (target.onLeave(leaving), leaving && onClose())} />
      </div>
      {tags.length > 0 && (
        <ul
          ref={tagsRef}
          className="lift-tags"
          aria-label="All tags"
          data-place={place?.tags ?? 'below'}
          style={place ? { [place.tags === 'below' ? 'top' : 'bottom']: `calc(100% + ${GAP + tagsOffset}px)` } : undefined}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
        >
          {tags.map((t) => (
            <li key={t.kind}>
              <Tag tag={t} onFilter={filter} labelled />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The element Tab would reach after `el`, as if the lift weren't there (its own buttons first, then onwards). */
function nextTabbable(el: HTMLElement): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter((n) => !n.closest('.card-lift') && n.offsetParent !== null)
  const after = all.filter((n) => el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)
  return after[0] ?? null
}
