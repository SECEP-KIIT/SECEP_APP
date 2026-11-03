import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isTypingTarget } from '../shell/focusKeys'
import { CardLiftProvider } from './CardLift'
import { InboxContext, useToasts, type InboxApi, type OpenOptions } from './inboxContext'
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
  const { toasts, push, dismiss } = useToasts()
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
      <p id="card-hint" className="sr-only">
        Enter or Space opens the details.
      </p>
      <CardLiftProvider>{children}</CardLiftProvider>
      <Legend open={legend} onClose={() => setLegend(false)} />
      {drawer && (
        <Suspense fallback={null}>
          <EmailDrawer key={drawer.id} id={drawer.id} compose={drawer.compose} onClose={closeDrawer} />
        </Suspense>
      )}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </InboxContext.Provider>
  )
}
