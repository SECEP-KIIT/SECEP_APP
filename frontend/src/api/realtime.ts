// Live updates over Socket.io (§6.5: path /api/socket.io, namespace /ws, access token on connect, payloads §6.4.1).
// The same code runs against the MSW socket mock and against M6.
//
// Cache policy:
// - An event for an email/action the cache already holds patches it IN PLACE. No reordering and no height change
//   under the cursor (NFR-PERF-011).
// - An email the cache doesn't hold (a real arrival) is NOT inserted into any visible list. It is only recorded in
//   `arrivals` below; the "↑ n new" pill and scroll preservation are the column widget's policy (FR-UI-024).
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Socket } from 'socket.io-client'
import { currentAccessToken, refreshForSocket } from './client'
import type { Action, AppNotification, EmailDetail, EmailListItem, LinkView, Page, SecurityFlag } from './types'

interface Events {
  'email.triaged': { email_id: string; email: EmailListItem }
  'email.enriched': { email_id: string; status: EmailListItem['status']; summary_one_line: string | null; summary_short: string | null; actions: Action[] }
  'email.flagged': { email_id: string; security_flag: SecurityFlag; links: LinkView[] }
  'action.updated': { action: Action }
  // PROPOSED (pending SRS v1.3): the item shape of GET /notifications.
  'notification.new': { notification: AppNotification }
}

// ── New-arrival signal (read by the column widgets' "↑ n new" pill, FR-UI-024) ─────────────────────────────────
// Each arrival keeps its card, so every column can count only the arrivals that match its own filters. A column
// stops counting an arrival once the arrival is in its loaded pages (after the pill resets it to page 1).
const ARRIVALS_MAX = 200
/** An email that arrived over the socket, with the time it arrived here (the pill's baseline compares to it). */
export interface Arrival {
  email: EmailListItem
  at: number
}
const arrivalItems = new Map<string, Arrival>()
const arrivalListeners = new Set<() => void>()
let arrivalsSnapshot: readonly Arrival[] = []

export const arrivals = {
  subscribe(listener: () => void) {
    arrivalListeners.add(listener)
    return () => void arrivalListeners.delete(listener)
  },
  /** Emails that arrived after their lists were loaded, oldest first. Stable between changes. */
  get: () => arrivalsSnapshot,
  clear() {
    arrivalItems.clear()
    publishArrivals()
  },
}
function publishArrivals() {
  arrivalsSnapshot = [...arrivalItems.values()]
  for (const l of arrivalListeners) l()
}
function addArrival(email: EmailListItem) {
  arrivalItems.delete(email.id) // re-signalled: it moves to the end with its new time
  arrivalItems.set(email.id, { email, at: Date.now() })
  for (const id of arrivalItems.keys()) {
    if (arrivalItems.size <= ARRIVALS_MAX) break
    arrivalItems.delete(id)
  }
  publishArrivals()
}

/**
 * Counts an email the caller's own change made newly visible to a list that is on screen (e.g. restored from
 * Handled while an inbox column shows). Same signal as a real arrival: it is never inserted, only counted by the pill.
 */
export function signalArrival(email: EmailListItem) {
  addArrival(listFields(email) as EmailListItem)
}

// ── Cache patching ─────────────────────────────────────────────────────────────────────────────────────────────
// Email lists are cached either as one Page (plain queries) or as InfiniteData of Pages (the column widgets).
type ListData = Page<EmailListItem> | InfiniteData<Page<EmailListItem>, unknown>
const pagesOf = (data: ListData): Page<EmailListItem>[] => ('pages' in data ? data.pages : [data])

function patchPage(page: Page<EmailListItem>, id: string, patch: Partial<EmailListItem>): Page<EmailListItem> {
  return page.items.some((e) => e.id === id) ? { ...page, items: page.items.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : page
}

/**
 * Patches an email IN PLACE wherever it is cached: list pages, the open detail, and a pending arrival. Never adds or
 * reorders. Returns whether any list or detail held it. Exported for mutations that get the new state back.
 */
export function patchEmailCache(qc: QueryClient, id: string, patch: Partial<EmailDetail>): boolean {
  let found = false
  const item = listFields(patch)
  for (const [key, data] of qc.getQueriesData<ListData>({ queryKey: ['emails'] })) {
    if (!data || !pagesOf(data).some((p) => p.items.some((e) => e.id === id))) continue
    found = true
    qc.setQueryData<ListData>(key, 'pages' in data ? { ...data, pages: data.pages.map((p) => patchPage(p, id, item)) } : patchPage(data, id, item))
  }
  const detail = qc.getQueryData<EmailDetail>(['email', id])
  if (detail) {
    found = true
    qc.setQueryData<EmailDetail>(['email', id], { ...detail, ...patch })
  }
  const arrival = arrivalItems.get(id)
  if (arrival) {
    arrivalItems.set(id, { ...arrival, email: { ...arrival.email, ...item } })
    publishArrivals()
  }
  return found
}

/** Only list fields go into list caches, so a detail-only field never leaks into a list item. */
function listFields(patch: Partial<EmailDetail>): Partial<EmailListItem> {
  const { body_text: _b, summary_short: _s, actions: _a, links: _l, attachments: _t, masked_secrets: _m, auth_results: _r, thread: _h, ...item } = patch
  return item
}

/** Replaces an action in place in action lists and in its email's open detail. Exported for mutations. */
export function patchActionCache(qc: QueryClient, action: Action) {
  for (const [key, data] of qc.getQueriesData<Page<Action>>({ queryKey: ['actions'] })) {
    if (data?.items.some((a) => a.id === action.id)) {
      qc.setQueryData<Page<Action>>(key, { ...data, items: data.items.map((a) => (a.id === action.id ? action : a)) })
    }
  }
  if (!action.email_id) return
  const detail = qc.getQueryData<EmailDetail>(['email', action.email_id])
  if (detail?.actions.some((a) => a.id === action.id)) {
    qc.setQueryData<EmailDetail>(['email', action.email_id], {
      ...detail,
      actions: detail.actions.map((a) => (a.id === action.id ? action : a)),
    })
  }
}

/** Applies one socket event to the query cache. Exported for tests. */
export function applyEvent<E extends keyof Events>(qc: QueryClient, event: E, payload: Events[E]) {
  handle(qc, event, payload)
}

function handle<E extends keyof Events>(qc: QueryClient, event: E, payload: Events[E]) {
  switch (event) {
    case 'email.triaged': {
      const { email_id, email } = payload as Events['email.triaged']
      // Known email (e.g. relabelled): in place. Unknown: signal only.
      if (!patchEmailCache(qc, email_id, email) && !arrivalItems.has(email_id)) addArrival(email)
      break
    }
    case 'email.enriched': {
      const p = payload as Events['email.enriched']
      patchEmailCache(qc, p.email_id, {
        status: p.status,
        summary_one_line: p.summary_one_line,
        summary_short: p.summary_short,
        actions: p.actions,
        proposed_action_count: p.actions.filter((a) => a.status === 'proposed').length,
      })
      break
    }
    case 'email.flagged': {
      const p = payload as Events['email.flagged']
      patchEmailCache(qc, p.email_id, { security_flag: p.security_flag, links: p.links })
      break
    }
    case 'action.updated':
      patchActionCache(qc, (payload as Events['action.updated']).action)
      break
    case 'notification.new': {
      const { notification } = payload as Events['notification.new']
      // The notification list isn't the inbox: newest first is its natural order.
      qc.setQueryData<Page<AppNotification>>(['notifications'], (page) =>
        page && !page.items.some((n) => n.id === notification.id) ? { ...page, items: [notification, ...page.items] } : page,
      )
      break
    }
  }
  // Counts for the sidebar badges and the lock glance change with almost every event.
  void qc.invalidateQueries({ queryKey: ['glance'] })
}

// ── Connection ─────────────────────────────────────────────────────────────────────────────────────────────────
let socket: Socket | null = null
let started = false

/**
 * Connects once for the app's lifetime. `onSettled` fires on the first connect or first failure (boot step).
 *
 * socket.io-client is imported lazily, for two reasons: it stays out of the app chunk (NFR-PERF-010), and
 * engine.io-client captures `globalThis.WebSocket` when its module is first evaluated. A static import would load
 * before MSW patches WebSocket in dev (main.tsx enables mocking first), and the socket would bypass the mock.
 */
export function connectRealtime(qc: QueryClient, onSettled: () => void) {
  if (started) return
  started = true
  let settled = false
  const settle = () => {
    if (!settled) {
      settled = true
      onSettled()
    }
  }
  // A socket that neither connects nor fails (e.g. nothing listening) must not hold the lock screen forever.
  setTimeout(settle, 5_000)
  void import('socket.io-client').then(({ io }) => open(io, qc, settle), settle)
}

function open(io: typeof import('socket.io-client').io, qc: QueryClient, settle: () => void) {
  let retriedAuth = false
  socket = io('/ws', {
    path: '/api/socket.io',
    // WebSocket only: no long-polling fallback (Caddy proxies WebSockets; the mock intercepts only WebSockets).
    transports: ['websocket'],
    // Called on every (re)connect, so a reconnect sends the current token, not the one from the first attempt.
    // The token goes in the handshake payload, never the URL, where proxies and logs would record it.
    auth: (cb) => void currentAccessToken().then((token) => cb({ token })),
  })

  socket.on('connect', () => {
    retriedAuth = false
    settle()
  })
  socket.on('connect_error', async (err) => {
    settle()
    // The server refused the token (expired): refresh once and reconnect. Without a new token, stay disconnected
    // rather than loop; the REST client handles the signed-out case.
    if (err.message === 'unauthenticated' && !retriedAuth) {
      retriedAuth = true
      if (await refreshForSocket()) socket?.connect()
    }
  })

  const events: (keyof Events)[] = ['email.triaged', 'email.enriched', 'email.flagged', 'action.updated', 'notification.new']
  for (const event of events) socket.on(event, (payload: Events[typeof event]) => handle(qc, event, payload))
}
