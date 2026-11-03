import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LayoutPage, Widget } from '../api/types'
import { DragHandle } from './dragHandle'
import { reorderWidget, widgetTitle } from './layoutModel'

/** The tile under the pointer; with the keyboard (no pointer), the nearest one. Gaps between tiles hit nothing. */
const collision: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args))
/** Tiles never shift under a drag by transform: the order itself changes, and the CSS flow places them. */
const noShift = () => null
/** Same rule as the CSS: <html data-motion> from ui_prefs.motion, else the system setting (FR-UI-032). */
function reducedMotion() {
  const m = document.documentElement.dataset.motion
  return m === 'reduced' || m === 'off' || (m === undefined && matchMedia('(prefers-reduced-motion: reduce)').matches)
}

/**
 * Desktop and tablet pages (proposals §16.3): tiles in order, filling rows of 3 slots; the CSS grid does the flow
 * (`grid-auto-flow: row`, each tile spanning 1–3 columns, rows as tall as their tallest tile).
 *
 * Editing: drag a tile by its title bar (or Space on it, then arrows) and drop it on another. The order changes live
 * while you drag: same-size tiles swap, otherwise the tiles from the target on move one along. Tiles that move
 * slide into place (transform only; no motion under reduced motion). Esc cancels and restores the order.
 */
export function FlowPage({ page, editing, render, onChange }: {
  page: LayoutPage
  editing: boolean
  render: (id: string) => ReactNode
  onChange: (page: LayoutPage) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [active, setActive] = useState<Widget | null>(null)
  const start = useRef<LayoutPage | null>(null)
  // The last tile the drag was over. A reorder runs only when the pointer reaches a different tile, so a tile that
  // just moved out from under the pointer can't bounce straight back.
  const lastOver = useRef<string | null>(null)
  const latest = useRef(page)
  useEffect(() => {
    latest.current = page
  }, [page])

  const end = () => {
    setActive(null)
    start.current = null
    lastOver.current = null
    // Text selection is off while dragging (QA pass 3).
    delete document.documentElement.dataset.dragging
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active: a }) => {
        start.current = latest.current
        lastOver.current = String(a.id)
        setActive(latest.current.widgets.find((w) => w.id === a.id) ?? null)
        document.documentElement.dataset.dragging = ''
      }}
      onDragOver={({ active: a, over }) => {
        if (!over || over.id === lastOver.current) return
        lastOver.current = String(over.id)
        const next = reorderWidget(latest.current, String(a.id), String(over.id))
        if (next !== latest.current) onChange(next)
      }}
      onDragEnd={end}
      onDragCancel={() => {
        if (start.current) onChange(start.current)
        end()
      }}
    >
      <SortableContext items={page.widgets.map((w) => w.id)} strategy={noShift} disabled={!editing}>
        <div className="flow-page" data-editing={editing || undefined}>
          {page.widgets.map((w) => (
            <FlowTile key={w.id} widget={w} dragging={active?.id === w.id}>
              {render(w.id)}
            </FlowTile>
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={reducedMotion() ? null : undefined}>
        {active && (
          <div className="tile-drag" data-swatch={active.colour ?? undefined}>
            {active.icon && <span aria-hidden="true">{active.icon}</span>} {widgetTitle(active)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function FlowTile({ widget, dragging, children }: { widget: Widget; dragging: boolean; children: ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition } = useSortable({
    id: widget.id,
    // Every tile whose place changes slides there from where it was (FLIP, transform only).
    animateLayoutChanges: () => !reducedMotion(),
  })
  return (
    <div
      ref={setNodeRef}
      className="flow-tile"
      data-size={widget.size}
      data-dragging={dragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition: reducedMotion() ? undefined : transition }}
    >
      <DragHandle.Provider value={{ ref: setActivatorNodeRef, listeners, attributes: { ...attributes, 'aria-roledescription': 'movable tile' } }}>
        {children}
      </DragHandle.Provider>
    </div>
  )
}
