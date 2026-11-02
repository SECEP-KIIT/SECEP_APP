import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Column } from '../inbox/Column'
import { InboxContext, useToasts, type InboxApi, type OpenOptions } from '../inbox/inboxContext'
import { Legend } from '../inbox/Legend'
import { Toaster } from '../inbox/Toaster'
import { isTypingTarget } from '../shell/focusKeys'

// The drawer is its own chunk, fetched on the first open (NFR-PERF-010).
const EmailDrawer = lazy(() => import('../drawer/EmailDrawer'))

// The Inbox full view: one column widget (FR-UI-006). The tiling dashboard (task 8) puts several on a page.
export function Component() {
  const [legend, setLegend] = useState(false)
  const [drawer, setDrawer] = useState<({ id: string } & OpenOptions) | null>(null)
  const { toasts, push, dismiss } = useToasts()
  // The dialog returns focus to its opener on close. If the drawer's own change removed that card (Mark handled),
  // focus goes to the opener's column title instead of being lost to <body>.
  const opener = useRef<{ el: HTMLElement | null; column: HTMLElement | null }>({ el: null, column: null })
  const api = useMemo<InboxApi>(
    () => ({
      open: (id, opts) => {
        const el = document.activeElement instanceof HTMLElement ? document.activeElement : null
        opener.current = { el, column: el?.closest<HTMLElement>('.column')?.querySelector<HTMLElement>('.col-title') ?? null }
        setDrawer({ id, ...opts })
      },
      toast: push,
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

  return (
    <InboxContext.Provider value={api}>
      <div className="inbox-page">
        <p id="card-hint" className="sr-only">
          Enter or Space opens the details.
        </p>
        <Column title="Inbox" onLegend={() => setLegend(true)} />
        <Legend open={legend} onClose={() => setLegend(false)} />
        {drawer && (
          <Suspense fallback={null}>
            <EmailDrawer key={drawer.id} id={drawer.id} compose={drawer.compose} onClose={closeDrawer} />
          </Suspense>
        )}
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </div>
    </InboxContext.Provider>
  )
}
