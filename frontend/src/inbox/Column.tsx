import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownUp, ArrowUp, CircleHelp, Rows3, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { emailListOptions, listRequestedAt } from '../api/queries'
import { arrivals } from '../api/realtime'
import type { EmailListItem, Page } from '../api/types'
import { useFocused } from '../shell/focusMode'
import { useMinuteClock } from '../shell/useMinuteClock'
import {
  addFilter,
  columnQuery,
  DENSITIES,
  filterChips,
  matchesColumn,
  NO_FILTERS,
  ROW_PITCH,
  SORTS,
  urgencySplit,
  type ColumnFilters,
  type Density,
  type FilterPatch,
  type SortKey,
} from './cardModel'
import { EmailCard } from './EmailCard'
import { FilterPopover } from './FilterPopover'
import './inbox.css'

/** How long cards brought in by the pill keep their accent tint (item 9). */
const FRESH_MS = 2_000
/** Start loading the next page this many rows before the end. */
const PREFETCH_ROWS = 8
const SKELETON_ROWS = 6

interface Props {
  title: string
  onLegend: () => void
}

/**
 * An inbox column widget (FR-UI-006 "a saved filter and sort"; item 6). Rendered here as the Inbox full view; the
 * tiling dashboard (task 8) places several side by side and persists their filters, sort and density.
 *
 * No layout shift (NFR-PERF-011): every row has the same fixed pitch for its density, rows are virtualised
 * (TanStack Virtual) and live updates patch cards in place. New mail is never inserted: it shows as "↑ n new"
 * (FR-UI-024), and only a click on the pill brings it in, at the top, after scrolling there.
 */
export function Column({ title, onLegend }: Props) {
  const focused = useFocused()
  const now = useMinuteClock()
  const qc = useQueryClient()
  const [filters, setFilters] = useState<ColumnFilters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey>('newest')
  const [density, setDensity] = useState<Density>('comfortable')
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())

  const query = columnQuery(filters, sort, focused)
  const list = useInfiniteQuery({ ...emailListOptions(query ?? ''), enabled: query !== null })
  const items = useMemo(() => (query === null ? [] : (list.data?.pages.flatMap((p) => p.items) ?? [])), [query, list.data])
  const more = query !== null && list.hasNextPage

  // "↑ n new": arrivals after this column's first page was requested that match its filters and aren't loaded.
  const arrived = useSyncExternalStore(arrivals.subscribe, arrivals.get)
  const pending = useMemo(() => {
    if (query === null) return []
    const since = listRequestedAt.get(query) ?? Infinity
    const loaded = new Set(items.map((e) => e.id))
    return arrived.filter((a) => a.at > since && !loaded.has(a.email.id) && matchesColumn(a.email, filters, focused)).map((a) => a.email.id)
  }, [arrived, items, query, filters, focused])

  const scrollRef = useRef<HTMLDivElement>(null)
  const pitch = ROW_PITCH[density]
  const showSkeleton = query !== null && list.isPending
  const rowCount = showSkeleton ? SKELETON_ROWS : items.length + (more ? 1 : 0)
  // The virtualizer's functions are used only in this component's render, never passed to memoised children.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => pitch,
    overscan: 6,
  })
  // Every row's size changes together with the density; re-measure once rather than per row.
  useEffect(() => virtualizer.measure(), [virtualizer, pitch])

  const rows = virtualizer.getVirtualItems()
  const lastIndex = rows.at(-1)?.index ?? -1
  const { fetchNextPage, isFetchingNextPage } = list
  useEffect(() => {
    if (more && !isFetchingNextPage && lastIndex >= items.length - PREFETCH_ROWS) void fetchNextPage()
  }, [more, isFetchingNextPage, lastIndex, items.length, fetchNextPage])

  const onFilter = useCallback((patch: FilterPatch) => setFilters((f) => addFilter(f, patch)), [])

  // The pill: scroll to the top first, then reload page 1 only. The old cards stay on screen until it arrives (no
  // skeleton flash), and the arrivals fade in with an accent tint.
  const freshTimer = useRef(0)
  useEffect(() => () => clearTimeout(freshTimer.current), [])
  const showNew = () => {
    if (query === null) return
    const ids = new Set(pending)
    scrollRef.current?.scrollTo({ top: 0 })
    const key = emailListOptions(query).queryKey
    qc.setQueryData<InfiniteData<Page<EmailListItem>, string | null>>(key, (d) => d && { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) })
    void qc.refetchQueries({ queryKey: key, exact: true })
    setFresh(ids)
    clearTimeout(freshTimer.current)
    freshTimer.current = window.setTimeout(() => setFresh(new Set()), FRESH_MS)
  }

  const chips = filterChips(filters)
  const split = urgencySplit(items)
  const loadedCount = `${items.length}${more ? '+' : ''}`

  return (
    <section className="column" aria-labelledby="col-title" data-density={density}>
      <header className="col-head">
        <div className="col-title-row">
          <h2 className="col-title" id="col-title">
            {title}
          </h2>
          <span className="col-count" title={more ? `${items.length} loaded, more below` : `${items.length} emails`}>
            {loadedCount}
            <span className="sr-only">{more ? ' emails loaded, more below' : ' emails'}</span>
          </span>
          <div className="col-tools">
            <FilterPopover filters={filters} onChange={setFilters} />
            <label className="col-select" title="Sort">
              <ArrowDownUp size={16} aria-hidden="true" />
              <span className="sr-only">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-select" title="Density">
              <Rows3 size={16} aria-hidden="true" />
              <span className="sr-only">Density</span>
              <select value={density} onChange={(e) => setDensity(e.target.value as Density)}>
                {DENSITIES.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="col-tool" onClick={onLegend} title="Card symbols (?)" aria-keyshortcuts="?">
              <CircleHelp size={16} aria-hidden="true" />
              <span className="sr-only">Card symbols</span>
            </button>
          </div>
        </div>
        <UrgencyBar split={split} total={items.length} />
        {focused && <p className="col-note">Focus mode: Critical and High only</p>}
        {chips.length > 0 && (
          <ul className="chips" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.key}>
                <button type="button" className="chip" onClick={() => setFilters(c.remove)} aria-label={`Remove filter ${c.label}`}>
                  {c.label}
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="col-body">
        {pending.length > 0 && (
          <button type="button" className="new-pill" onClick={showNew}>
            <ArrowUp size={14} aria-hidden="true" />
            {pending.length} new
          </button>
        )}
        <p className="sr-only" aria-live="polite">
          {pending.length > 0 ? `${pending.length} new ${pending.length === 1 ? 'email' : 'emails'}` : ''}
        </p>

        <div className="col-scroll" ref={scrollRef}>
          {list.isError && query !== null ? (
            <div className="col-state" role="alert">
              <p>Couldn't load this column.</p>
              <button type="button" className="text-button" onClick={() => void list.refetch()}>
                Try again
              </button>
            </div>
          ) : !showSkeleton && items.length === 0 ? (
            <EmptyState filtered={chips.length > 0 || focused} onClear={() => setFilters(NO_FILTERS)} canClear={chips.length > 0} />
          ) : (
            <div
              className="col-rows"
              role={showSkeleton ? undefined : 'list'}
              aria-busy={showSkeleton || list.isFetching || undefined}
              style={{ height: virtualizer.getTotalSize() }}
            >
              {rows.map((row) => {
                const email = items[row.index]
                return (
                  <div
                    key={showSkeleton ? `skel-${row.index}` : (email?.id ?? 'more')}
                    className="col-row"
                    role={showSkeleton ? undefined : 'listitem'}
                    aria-setsize={showSkeleton || !email ? undefined : more ? -1 : items.length}
                    aria-posinset={showSkeleton || !email ? undefined : row.index + 1}
                    style={{ transform: `translateY(${row.start}px)`, height: pitch }}
                  >
                    {email && !showSkeleton ? (
                      <EmailCard email={email} now={now} density={density} fresh={fresh.has(email.id)} onFilter={onFilter} />
                    ) : (
                      <SkeletonCard density={density} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** Count plus a thin bar split by urgency (item 3). Covers the loaded cards; the list API has no totals. */
function UrgencyBar({ split, total }: { split: { urgency: string; count: number }[]; total: number }) {
  if (total === 0) return <div className="urgency-bar" aria-hidden="true" />
  const text = split.map((s) => `${s.count} ${s.urgency}`).join(', ')
  return (
    <div className="urgency-bar" role="img" aria-label={`Urgency of loaded emails: ${text}`} title={text}>
      {split.map((s) => (
        <span key={s.urgency} data-urgency={s.urgency} style={{ flexGrow: s.count }} />
      ))}
    </div>
  )
}

function SkeletonCard({ density }: { density: Density }) {
  return (
    <div className="card card-skeleton" data-density={density} aria-hidden="true">
      <div className="card-meta">
        <span className="skel skel-chip" />
        <span className="skel skel-word" />
      </div>
      <span className="skel skel-line skel-line-bold" />
      <span className="skel skel-line" />
    </div>
  )
}

/** Empty states with character (item 3). */
function EmptyState({ filtered, canClear, onClear }: { filtered: boolean; canClear: boolean; onClear: () => void }) {
  return (
    <div className="col-state">
      {filtered ? (
        <>
          <p className="col-state-title">Nothing matches</p>
          <p>No emails fit these filters right now.</p>
          {canClear && (
            <button type="button" className="text-button" onClick={onClear}>
              Clear filters
            </button>
          )}
        </>
      ) : (
        <>
          <p className="col-state-title">All clear</p>
          <p>Enjoy the view.</p>
        </>
      )}
    </div>
  )
}

