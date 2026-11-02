import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { LayoutPage, Widget } from '../api/types'
import { ghostSlots, PHONE_COLS, PHONE_ROWS, phoneRowsFor } from './grid'
import { widgetTitle } from './layoutModel'

const GAP = 12
/** Four rows only if each gets at least this much (a title bar plus a compact card); otherwise three. */
const MIN_ROW_FOR_4 = 110
const LONG_PRESS_MS = 500
/** A press this close to a widget's edge counts as the gap: with the 12 px gap, a ~44 px touch zone (item 2). */
const EDGE_ZONE = 16
const MOVE_TOLERANCE = 10

interface Props {
  page: LayoutPage
  render: (id: string) => ReactNode
  editing: boolean
  selected: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, slot: { x: number; y: number }) => void
  /** Long-press in a gap between widgets (FR-UI-009). */
  onEnterEdit: () => void
}

/**
 * Phone pages (FR-UI-009): a fixed 2 × 4 slot grid. Row height comes from the available height; on a short screen
 * (e.g. 360 × 480) 3 rows share the screen instead of squeezing in 4, and the 4th row is a snap-scroll away.
 *
 * Editing: long-press a gap (or Edit) → tap a widget to pick it → ghost outlines, sized to it, show where it fits →
 * tap one to move it there. While editing, a widget's body is a "pick" target, so taps never open cards.
 */
export function PhonePage({ page, render, editing, selected, onSelect, onMove, onEnterEdit }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const slotsRef = useRef<HTMLDivElement>(null)
  const [rowH, setRowH] = useState(0)
  const [rows, setRows] = useState<3 | 4>(PHONE_ROWS)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const h = el.clientHeight
      const fit = phoneRowsFor(h, GAP, MIN_ROW_FOR_4)
      setRows(fit)
      // The visible rows exactly fill one screen; with 3, the 4th row is one snap-scroll below.
      setRowH(Math.max(1, Math.floor((h - GAP * (fit - 1)) / fit)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Long-press in a gap: anywhere outside a widget, or within EDGE_ZONE of a widget's edge.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }
  const onPointerDown = (e: PointerEvent) => {
    if (editing || e.pointerType === 'mouse' || !inGap(e.clientX, e.clientY, slotsRef.current)) return
    press.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => (cancel(), onEnterEdit()), LONG_PRESS_MS) }
  }
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancel()
  }
  useEffect(() => cancel, [])

  const picked = editing ? page.widgets.find((w) => w.id === selected) : undefined
  const ghosts = picked ? ghostSlots(page.widgets, picked) : []
  const style = { '--slot-h': `${rowH}px`, '--slot-gap': `${GAP}px` } as CSSProperties
  const area = (b: Pick<Widget, 'x' | 'y' | 'w' | 'h'>) => ({ gridColumn: `${b.x + 1} / span ${b.w}`, gridRow: `${b.y + 1} / span ${b.h}` })

  return (
    <div
      className="phone-page"
      ref={ref}
      data-rows={rows}
      data-editing={editing || undefined}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => press.current && e.preventDefault()}
    >
      {rowH > 0 && (
        <div
          className="phone-slots"
          ref={slotsRef}
          style={{ gridTemplateColumns: `repeat(${PHONE_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${PHONE_ROWS}, var(--slot-h))` }}
          onClick={(e) => editing && e.target === e.currentTarget && onSelect(null)}
        >
          {page.widgets.map((w) => (
            <div key={w.id} className="phone-slot" style={area(w)} data-selected={w.id === selected || undefined}>
              {render(w.id)}
              {editing && (
                <button
                  type="button"
                  className="slot-pick"
                  aria-pressed={w.id === selected}
                  onClick={() => onSelect(w.id === selected ? null : w.id)}
                >
                  <span className="sr-only">{w.id === selected ? `${widgetTitle(w)} picked. Tap a free slot to move it` : `Pick ${widgetTitle(w)} to move it`}</span>
                </button>
              )}
            </div>
          ))}
          {picked &&
            ghosts.map((g) => (
              <button key={`${g.x}-${g.y}`} type="button" className="ghost-slot" style={area({ ...g, w: picked.w, h: picked.h })} onClick={() => onMove(picked.id, g)}>
                <span className="sr-only">
                  Move {widgetTitle(picked)} to row {g.y + 1}, {g.x === 0 ? 'left' : 'right'}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

function inGap(x: number, y: number, slots: HTMLElement | null) {
  if (!slots) return false
  for (const el of slots.querySelectorAll<HTMLElement>('.phone-slot')) {
    const r = el.getBoundingClientRect()
    if (x > r.left + EDGE_ZONE && x < r.right - EDGE_ZONE && y > r.top + EDGE_ZONE && y < r.bottom - EDGE_ZONE) return false
  }
  return true
}
