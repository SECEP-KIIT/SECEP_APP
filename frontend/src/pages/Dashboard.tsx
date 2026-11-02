import { ArrowLeft, ArrowRight, Check, LayoutGrid, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { Widget } from '../api/types'
import { Gallery } from '../dashboard/Gallery'
import { GridPage } from '../dashboard/GridPage'
import { isPhoneLayout } from '../dashboard/grid'
import {
  addPage,
  addWidget,
  applyGrid,
  duplicateWidget,
  MAX_PAGES,
  movePage,
  moveToSlot,
  patchWidget,
  removePage,
  removeWidget,
  renamePage,
  resizeWidget,
  sortedPages,
  updatePage,
} from '../dashboard/layoutModel'
import { isSideways, pageKeyAction, SWIPE_TOUCH_PX, SWIPE_WHEEL_PX } from '../dashboard/pageKeys'
import { PhonePage } from '../dashboard/PhonePage'
import { useLayout, type SaveState } from '../dashboard/useLayout'
import { WidgetFrame, type WidgetActions } from '../dashboard/WidgetFrame'
import { useInbox } from '../inbox/inboxContext'
import { InboxHost } from '../inbox/InboxHost'
import { useDeviceClass } from '../shell/useDeviceClass'
import '../dashboard/dashboard.css'

const SWIPE_COOLDOWN_MS = 600

/**
 * The paged dashboard at `/` (FR-UI-006–010, item 2). Pages of widget tiles, saved per user and device class.
 * Desktop and tablet tile on a 12-column grid; phones use fixed slot pages. Only the active page renders.
 */
export function Component() {
  return (
    <InboxHost>
      <Dashboard />
    </InboxHost>
  )
}

function Dashboard() {
  const device = useDeviceClass()
  const phone = isPhoneLayout(device)
  const { toast } = useInbox()
  const { pages, isDefault, query, state, update } = useLayout(device, toast)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [direction, setDirection] = useState<-1 | 1>(1)
  const [editing, setEditingState] = useState(false)
  const [gallery, setGallery] = useState(false)
  // Phone edit mode: the widget picked to move (FR-UI-009).
  const [selected, setSelected] = useState<string | null>(null)
  const setEditing = (on: boolean) => {
    setEditingState(on)
    if (!on) setSelected(null)
  }

  const sorted = pages ? sortedPages(pages) : []
  const index = Math.max(0, sorted.findIndex((p) => p.id === activeId))
  const page = sorted[index]

  const go = (i: number) => {
    const target = sorted[Math.min(Math.max(i, 0), sorted.length - 1)]
    if (!target || target.id === page?.id) return
    setDirection(i > index ? 1 : -1)
    setActiveId(target.id)
    setSelected(null)
  }
  const goRef = useRef(go)
  useEffect(() => {
    goRef.current = go
  })

  // Ctrl+←/→, Ctrl+1…9 (FR-UI-007).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const action = pageKeyAction(e, sorted.length)
      if (!action) return
      e.preventDefault()
      goRef.current('to' in action ? action.to : index + action.by)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [sorted.length, index])

  // Trackpad swipe (wheel deltaX) and touch swipe. Never while editing, where dragging means moving tiles.
  const wheel = useRef({ dx: 0, until: 0 })
  const onWheel = (e: WheelEvent) => {
    if (editing || !isSideways(e.deltaX, e.deltaY)) return
    const now = Date.now()
    if (now < wheel.current.until) return
    wheel.current.dx += e.deltaX
    if (Math.abs(wheel.current.dx) >= SWIPE_WHEEL_PX) {
      go(index + (wheel.current.dx > 0 ? 1 : -1))
      wheel.current = { dx: 0, until: now + SWIPE_COOLDOWN_MS }
    }
  }
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && !editing) touch.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = touch.current
    touch.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) >= SWIPE_TOUCH_PX && isSideways(dx, dy)) go(index + (dx < 0 ? 1 : -1))
  }

  if (query.isPending) return <div className="dash dash-loading" aria-busy="true" />
  if (query.isError || !page) {
    return (
      <div className="dash col-state" role="alert">
        <p>Couldn't load your dashboard.</p>
        <button type="button" className="text-button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    )
  }

  const editPage = (fn: Parameters<typeof updatePage>[2]) => update((ps) => updatePage(ps, page.id, fn))
  const actionsFor = (w: Widget): WidgetActions => ({
    patch: (patch) => editPage((p) => patchWidget(p, w.id, patch)),
    resize: (size) => {
      const next = resizeWidget(page, w.id, size, device)
      if (next) editPage(() => next)
      return next !== null
    },
    duplicate: () => {
      const next = duplicateWidget(page, w.id, device)
      if (next) editPage(() => next)
      return next !== null
    },
    remove: () => editPage((p) => removeWidget(p, w.id)),
  })
  const render = (id: string) => {
    const w = page.widgets.find((x) => x.id === id)
    return w && <WidgetFrame widget={w} device={device} editing={editing} actions={actionsFor(w)} />
  }

  const newPage = () => {
    const next = addPage(sorted)
    if (!next) return toast(`A dashboard holds up to ${MAX_PAGES} pages.`)
    update(() => next)
    setDirection(1)
    setActiveId(sortedPages(next).at(-1)!.id)
  }

  return (
    <div className="dash" data-editing={editing || undefined}>
      <div className="dash-bar">
        {editing ? (
          <div className="dash-page-tools">
            <label className="sr-only" htmlFor="page-name">
              Page name
            </label>
            <input
              id="page-name"
              className="dash-page-name"
              defaultValue={page.name}
              key={page.id}
              maxLength={40}
              onBlur={(e) => update((ps) => renamePage(ps, page.id, e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <button type="button" className="col-tool" title="Move page left" disabled={index === 0} onClick={() => update((ps) => movePage(ps, page.id, -1))}>
              <ArrowLeft size={15} aria-hidden="true" />
              <span className="sr-only">Move page left</span>
            </button>
            <button type="button" className="col-tool" title="Move page right" disabled={index === sorted.length - 1} onClick={() => update((ps) => movePage(ps, page.id, 1))}>
              <ArrowRight size={15} aria-hidden="true" />
              <span className="sr-only">Move page right</span>
            </button>
            <button type="button" className="col-tool" title="Delete this page" disabled={sorted.length <= 1} onClick={() => update((ps) => removePage(ps, page.id))}>
              <Trash2 size={15} aria-hidden="true" />
              <span className="sr-only">Delete this page</span>
            </button>
          </div>
        ) : (
          <h2 className="dash-title">{page.name}</h2>
        )}
        <SaveStatus state={state} isDefault={isDefault} />
        {editing && (
          <button type="button" className="ghost-button" onClick={() => setGallery(true)}>
            <Plus size={14} aria-hidden="true" /> Add widget
          </button>
        )}
        {/* On phones a long-press in a gap also enters edit mode; the button is the discoverable, accessible way. */}
        <button type="button" className={editing ? 'primary-button' : 'ghost-button'} aria-pressed={editing} onClick={() => setEditing(!editing)}>
          {editing ? <Check size={14} aria-hidden="true" /> : <LayoutGrid size={14} aria-hidden="true" />}
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <div className="dash-pages" onWheel={onWheel} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div key={page.id} className="dash-page" data-direction={direction}>
          {page.widgets.length === 0 ? (
            <div className="col-state">
              <p className="col-state-title">An empty page</p>
              <p>Choose Edit, then Add widget.</p>
            </div>
          ) : phone ? (
            <PhonePage
              page={page}
              render={render}
              editing={editing}
              selected={selected}
              onSelect={setSelected}
              onEnterEdit={() => setEditing(true)}
              onMove={(id, slot) => {
                const next = moveToSlot(page, id, slot)
                if (next) editPage(() => next)
                setSelected(null)
              }}
            />
          ) : (
            <GridPage page={page} editing={editing} render={render} onLayout={(items) => {
              const next = applyGrid(page, items)
              if (next !== page) editPage(() => next)
            }} />
          )}
        </div>
      </div>

      <nav className="page-dots" aria-label="Pages">
        {sorted.map((p, i) => (
          <button key={p.id} type="button" className="page-dot" aria-current={i === index ? 'page' : undefined} onClick={() => go(i)} title={`${p.name} (Ctrl+${i + 1})`}>
            <span className="dot" aria-hidden="true" />
            <span className="dot-pill">{p.name}</span>
          </button>
        ))}
        <button type="button" className="page-dot page-add" onClick={newPage} title="Add a page" disabled={sorted.length >= MAX_PAGES}>
          <Plus size={12} aria-hidden="true" />
          <span className="sr-only">Add a page</span>
        </button>
      </nav>

      <Gallery
        open={gallery}
        onClose={() => setGallery(false)}
        onPick={(preset) => {
          const next = addWidget(page, preset, device)
          if (!next) return toast('This page is full. Add a page first.')
          editPage(() => next)
          setGallery(false)
        }}
      />
    </div>
  )
}

function SaveStatus({ state, isDefault }: { state: SaveState; isDefault: boolean }) {
  const text = isDefault && state === 'saved' ? 'Starter layout' : { saved: 'Saved', pending: 'Saving…', saving: 'Saving…', error: 'Not saved' }[state]
  return (
    <span className="dash-save" data-state={state} role="status">
      {text}
    </span>
  )
}
