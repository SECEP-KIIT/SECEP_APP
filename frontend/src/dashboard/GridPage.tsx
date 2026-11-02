import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import type { LayoutPage } from '../api/types'
import { GRID_COLS, GRID_MAX_H, GRID_ROWS_PER_SCREEN } from './grid'

const GAP = 12
const MIN_ROW = 28

/**
 * Desktop and tablet tiling (FR-UI-008, item 2): a 12-column snap grid. Tiles move and resize only in edit mode, by
 * the title bar, so dragging a card and dragging a tile never collide. Twelve rows fill one screen: the row height
 * follows the page height, and a page taller than that scrolls.
 */
export function GridPage({ page, editing, onLayout, render }: {
  page: LayoutPage
  editing: boolean
  onLayout: (items: Layout) => void
  render: (id: string) => ReactNode
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const rowHeight = useRowHeight(containerRef)
  const layout = useMemo<Layout>(
    () => page.widgets.map((w) => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 3, maxH: GRID_MAX_H })),
    [page.widgets],
  )

  return (
    // React 18 types want RefObject<HTMLDivElement>; the hook types it for React 19 (nullable). Same object.
    <div className="grid-page" ref={containerRef as RefObject<HTMLDivElement>} data-editing={editing || undefined}>
      {mounted && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: GRID_COLS, rowHeight, margin: [GAP, GAP], containerPadding: [0, 0] }}
          dragConfig={{ enabled: editing, handle: '.widget-bar', cancel: 'button, input, select, a', threshold: 4 }}
          resizeConfig={{ enabled: editing, handles: ['se'] }}
          // Called on mount and after every drag or resize; outside edit mode nothing moves, so nothing is saved.
          onLayoutChange={(next) => editing && onLayout(next)}
        >
          {page.widgets.map((w) => (
            <div key={w.id} className="grid-item">
              {render(w.id)}
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}

/** Row height so that GRID_ROWS_PER_SCREEN rows fill the page's visible height. */
function useRowHeight(ref: RefObject<HTMLDivElement | null>) {
  const [h, setH] = useState(48)
  const last = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const height = el.clientHeight
      if (height === last.current) return
      last.current = height
      setH(Math.max(MIN_ROW, Math.floor((height - GAP * (GRID_ROWS_PER_SCREEN - 1)) / GRID_ROWS_PER_SCREEN)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return h
}
