import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
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
  const api = useMemo<InboxApi>(() => ({ open: (id, opts) => setDrawer({ id, ...opts }), toast: push }), [push])

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
            <EmailDrawer key={drawer.id} id={drawer.id} compose={drawer.compose} onClose={() => setDrawer(null)} />
          </Suspense>
        )}
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </div>
    </InboxContext.Provider>
  )
}
