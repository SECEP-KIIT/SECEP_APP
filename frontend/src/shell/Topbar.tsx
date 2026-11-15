import { useQueryClient, type QueryCache } from '@tanstack/react-query'
import { Bell, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMatches } from 'react-router'
import { useMinuteClock } from './useMinuteClock'

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

const latestUpdate = (cache: QueryCache) => Math.max(0, ...cache.getAll().map((q) => q.state.dataUpdatedAt))

/** Latest successful fetch across all queries. Task 5 switches this to socket events. */
function useLastSync() {
  const cache = useQueryClient().getQueryCache()
  const [last, setLast] = useState(() => latestUpdate(cache))
  // Deferred: the cache also reports queries added while another component renders (a new column or section), and
  // React forbids updating this component in the middle of that render.
  useEffect(() => cache.subscribe(() => queueMicrotask(() => setLast(latestUpdate(cache)))), [cache])
  return last
}

function syncedAgo(last: number, now: number) {
  const s = Math.max(0, Math.round((now - last) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `at ${timeFmt.format(last)}`
}

/** "● synced 12 s ago", with a single pulse per sync and no loop (item 9). */
function SyncIndicator() {
  const last = useLastSync()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])
  if (!last) return null
  return (
    <span className="sync">
      {/* A new key remounts the dot, which replays its one-shot pulse. */}
      <span className="sync-dot" key={last} aria-hidden="true" />
      synced {syncedAgo(last, Math.max(now, last))}
    </span>
  )
}

// FR-UI-001 topbar: title + clock | search pill | sync, bell, quick-add. The weather chip comes with FR-WP-009
// (task 16). The pill, bell and quick-add are laid out now so nothing shifts later; they are enabled in tasks 11,
// 13 and 12.
export function Topbar() {
  const now = useMinuteClock()
  const title = useMatches()
    .map((m) => (m.handle as { title?: string } | undefined)?.title)
    .findLast(Boolean)

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{title}</h1>
        <time className="topbar-clock" dateTime={now.toISOString()}>
          {timeFmt.format(now)}
        </time>
      </div>
      <div className="topbar-centre">
        <button type="button" className="search-pill" disabled title="Search arrives with the command palette">
          <Search aria-hidden="true" size={16} />
          <span className="search-pill-label">Search</span>
          <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
      </div>
      <div className="topbar-right">
        <SyncIndicator />
        <button type="button" className="icon-button" disabled aria-label="Notifications">
          <Bell aria-hidden="true" size={18} />
        </button>
        <button type="button" className="icon-button" disabled aria-label="Quick add">
          <Plus aria-hidden="true" size={18} />
        </button>
      </div>
    </header>
  )
}
