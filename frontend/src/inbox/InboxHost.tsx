import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EmailListItem } from '../api/types'
import { anyLayerOpen, isTypingTarget } from '../shell/focusKeys'
import { CardLiftProvider } from './CardLift'
import { CardMenu } from './CardMenu'
import { InboxContext, useToasts, type InboxApi, type OpenOptions } from './inboxContext'
import { SelectionBar } from './SelectionBar'
import { selectRange, SelectionContext, type SelectionApi } from './selection'
import { Legend } from './Legend'
import { Toaster } from './Toaster'

// The drawer is its own chunk, fetched on the first open (NFR-PERF-010).
const EmailDrawer = lazy(() => import('../drawer/EmailDrawer'))

/**
 * One drawer, one legend and one toast stack for a page, however many columns it shows (the Inbox full view, or a
 * dashboard page of column tiles). Cards reach them through InboxContext.
 */
export function InboxHost({ children }: { children: ReactNode }) {
  const [legend, setLegend] = useState(false)
  const [drawer, setDrawer] = useState<({ id: string } & OpenOptions) | null>(null)
  const { toasts, push, dismiss, undo } = useToasts()
  const [menuAt, setMenuAt] = useState<{ email: EmailListItem; x: number; y: number } | null>(null)
  // Selection (FR-UI-027): ids only; bulk actions fetch what they need.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const selection = useMemo<SelectionApi>(
    () => ({
      selected,
      toggle: (id) => {
        anchor.current = id
        setSelected((s) => {
          const next = new Set(s)
          if (!next.delete(id)) next.add(id)
          return next
        })
      },
      range: (id, order) => setSelected((s) => selectRange(s, anchor.current, id, order)),
      set: (ids) => setSelected(new Set(ids)),
      clear: () => {
        anchor.current = null
        setSelected((s) => (s.size ? new Set() : s))
      },
    }),
    [selected],
  )
  // The dialog returns focus to its opener on close. If the drawer's own change removed that card (Mark handled,
  // read in the Unread view), focus goes to the opener's column title instead of being lost to <body>.
  const opener = useRef<{ el: HTMLElement | null; column: HTMLElement | null }>({ el: null, column: null })
  const api = useMemo<InboxApi>(
    () => ({
      open: (id, opts) => {
        const el = document.activeElement instanceof HTMLElement ? document.activeElement : null
        opener.current = { el, column: el?.closest<HTMLElement>('.column')?.querySelector<HTMLElement>('.col-title') ?? null }
        setDrawer({ id, ...opts })
      },
      toast: push,
      showLegend: () => setLegend(true),
      menu: (email, x, y) => setMenuAt({ email, x, y }),
    }),
    [push],
  )
  const closeDrawer = () => {
    setDrawer(null)
    const { el, column } = opener.current
    requestAnimationFrame(() => {
      if (el && !el.isConnected) column?.focus()
    })
  }

  // `?` shows the card legend (FR-UI-014). Never while typing or with a modifier (Shift is how `?` is typed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      e.preventDefault()
      setLegend(true)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // Ctrl/⌘+Z undoes the latest undoable action still offered (FR-UI-029). Esc clears a selection before it reaches
  // Focus mode (capture phase, defaultPrevented), but never while a dialog or popover owns the keys.
  const hasSelection = selected.size > 0
  const clearSelection = selection.clear
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (undo()) e.preventDefault()
      } else if (e.key === 'Escape' && hasSelection && !anyLayerOpen()) {
        e.preventDefault()
        clearSelection()
      }
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [undo, hasSelection, clearSelection])

  return (
    <InboxContext.Provider value={api}>
      <SelectionContext.Provider value={selection}>
      <p id="card-hint" className="sr-only">
        Enter or Space opens the details. Ctrl or Command click, or X, selects. Shift+F10 opens the actions menu.
      </p>
      <CardLiftProvider>{children}</CardLiftProvider>
      <SelectionBar />
      {menuAt && <CardMenu key={`${menuAt.email.id}-${menuAt.x}-${menuAt.y}`} at={menuAt} onClose={() => setMenuAt(null)} />}
      <Legend open={legend} onClose={() => setLegend(false)} />
      {drawer && (
        <Suspense fallback={null}>
          <EmailDrawer key={drawer.id} id={drawer.id} compose={drawer.compose} onClose={closeDrawer} />
        </Suspense>
      )}
      <Toaster toasts={toasts} onDismiss={dismiss} />
      </SelectionContext.Provider>
    </InboxContext.Provider>
  )
}
