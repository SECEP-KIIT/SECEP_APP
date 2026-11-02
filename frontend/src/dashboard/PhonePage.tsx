import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { LayoutPage } from '../api/types'
import { PHONE_COLS, PHONE_ROWS, phoneRowsFor } from './grid'

const GAP = 12
/** The smallest slot that still shows a title bar plus one compact card without cramming. */
const MIN_ROW = 132

/**
 * Phone pages (FR-UI-009): a fixed 2 × 4 slot grid. Row height comes from the available height; on a short screen
 * (e.g. 360 × 480) the slots keep a readable height and 3 rows fit at a time, with the last row a snap-scroll away
 * rather than all four squeezed in. Read-only here; phone edit mode is added on top (task 8b).
 */
export function PhonePage({ page, render, slots }: { page: LayoutPage; render: (id: string) => ReactNode; slots?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [rowH, setRowH] = useState(0)
  const [rows, setRows] = useState<3 | 4>(PHONE_ROWS)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const h = el.clientHeight
      const fit = phoneRowsFor(h, GAP, MIN_ROW)
      setRows(fit)
      setRowH(Math.max(MIN_ROW, Math.floor((h - GAP * (fit - 1)) / fit)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const style = { '--slot-h': `${rowH}px`, '--slot-gap': `${GAP}px` } as CSSProperties
  return (
    <div className="phone-page" ref={ref} data-rows={rows} style={style}>
      {rowH > 0 && (
        <div className="phone-slots" style={{ gridTemplateColumns: `repeat(${PHONE_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${PHONE_ROWS}, var(--slot-h))` }}>
          {page.widgets.map((w) => (
            <div key={w.id} className="phone-slot" style={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
              {render(w.id)}
            </div>
          ))}
          {slots}
        </div>
      )}
    </div>
  )
}
