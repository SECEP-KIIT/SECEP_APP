import { QueryClient, infiniteQueryOptions, keepPreviousData, queryOptions, useMutation, useQuery, type InfiniteData } from '@tanstack/react-query'
import { ApiError, api, apiBlob } from './client'
import { patchActionCache, patchEmailCache, signalArrival } from './realtime'
import type {
  Action,
  ActionType,
  AppNotification,
  DecoderActionPayload,
  EmailDetail,
  EmailPatch,
  GoResponse,
  EmailListItem,
  Glance,
  Layout,
  LayoutDeviceClass,
  LayoutPut,
  LabelCorrection,
  LabelCorrectionResponse,
  Me,
  Page,
  PreferencesResponse,
  Project,
  UiPrefs,
} from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 4xx won't fix itself, and 401s are already retried once by api(). Retry only 5xx and network errors.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') })

/**
 * One column's email list (GET /emails, §6.4.1), paged by cursor. `query` is the column's query string (cardModel
 * columnQuery), so each filter and sort combination has its own cache entry.
 *
 * Never refetched on its own (no stale time, window focus or reconnect refetch): a refetch would insert new mail at
 * the top, under the cursor (NFR-PERF-011). Live changes arrive over the socket and patch in place; new mail is only
 * counted by the "↑ n new" pill, which resets the list on click (FR-UI-024).
 */
/**
 * When each column's first page was last requested, keyed by query string. An arrival after this time that isn't in
 * the loaded pages counts towards the column's pill; anything older was already in (or past) that first page.
 */
export const listRequestedAt = new Map<string, number>()

export const emailListOptions = (query: string) =>
  infiniteQueryOptions({
    queryKey: ['emails', 'list', query],
    queryFn: ({ pageParam, signal }) => {
      const q = new URLSearchParams(query)
      if (pageParam) q.set('cursor', pageParam)
      else listRequestedAt.set(query, Date.now())
      const qs = q.toString()
      return api<Page<EmailListItem>>(qs ? `/emails?${qs}` : '/emails', { signal })
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Changing a filter keeps the old cards on screen until the new list arrives, instead of flashing skeletons.
    placeholderData: keepPreviousData,
  })

/** The default inbox column: no filters, newest first. Fetched during boot (lock-screen step) and reused. */
export const DEFAULT_COLUMN_QUERY = ''

// ── Email detail and actions (task 7: drawer and quick actions) ───────────────────────────────────────────────

/** GET /emails/:id. Live events patch it in place while the drawer is open. */
export const emailDetailOptions = (id: string) =>
  queryOptions({ queryKey: ['email', id], queryFn: ({ signal }) => api<EmailDetail>(`/emails/${id}`, { signal }) })

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/**
 * POST /actions/:id/accept (FR-ORC-012). `payload` holds only the edited fields. A 502 upstream_error means the
 * server marked the action failed after its retries (FR-ORC-006), so the detail is refetched to show that.
 */
export function acceptAction(action: Action, payload?: Partial<DecoderActionPayload>) {
  return api<Action>(`/actions/${action.id}/accept`, json(payload ? { payload } : {})).then(
    (updated) => {
      patchActionCache(queryClient, updated)
      return updated
    },
    (err: unknown) => {
      if (action.email_id) void queryClient.invalidateQueries({ queryKey: ['email', action.email_id] })
      throw err
    },
  )
}

export const rejectAction = (action: Action) =>
  api<Action>(`/actions/${action.id}/reject`, { method: 'POST' }).then((updated) => {
    patchActionCache(queryClient, updated)
    return updated
  })

/** POST /emails/:id/actions: a manual action ("Send to Jira" with no proposal), then the caller accepts it. */
export async function createAction(emailId: string, type: ActionType, payload: Partial<DecoderActionPayload>) {
  const action = await api<Action>(`/emails/${emailId}/actions`, json({ type, payload }))
  const detail = queryClient.getQueryData<EmailDetail>(['email', emailId])
  if (detail && !detail.actions.some((a) => a.id === action.id)) {
    queryClient.setQueryData<EmailDetail>(['email', emailId], { ...detail, actions: [...detail.actions, action] })
  }
  return action
}

type ListData = InfiniteData<{ items: EmailListItem[]; next_cursor: string | null }, string | null>

/**
 * Whether a list's per-user state views admit the email: the Handled view holds only handled mail and every other
 * list none (§10.3); the Unread view holds only unread mail (§12.3).
 */
export function stateAdmits(query: string, e: Pick<EmailListItem, 'handled' | 'read'>) {
  const view = new URLSearchParams(query).get('view')?.split(',') ?? []
  return view.includes('handled') === e.handled && !(view.includes('unread') && e.read)
}

/**
 * Settles every cached list after the caller's own state for one email changed (handled §10.3, read §12.3). It is
 * decided here, from the PATCH response alone, so the outcome never depends on whether the socket echo arrives
 * before or after the response (F11):
 * - a list the email no longer belongs to drops it: a deliberate removal, not a layout shift (item 9);
 * - a list it now belongs to never gets it inserted (NFR-PERF-011). On screen, the list counts it in "↑ n new"; off
 *   screen (a view not shown right now), the list is marked stale, so it reloads the next time it's shown. Lists
 *   are otherwise never refetched (staleTime: Infinity), so without this a cached view would stay wrong.
 */
function settleLists(detail: EmailListItem) {
  for (const [key, data] of queryClient.getQueriesData<ListData>({ queryKey: ['emails', 'list'] })) {
    if (!data) continue
    const held = data.pages.some((p) => p.items.some((e) => e.id === detail.id))
    const admits = stateAdmits(String(key[2] ?? ''), detail)
    if (held && !admits) {
      queryClient.setQueryData<ListData>(key, { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((e) => e.id !== detail.id) })) })
    } else if (!held && admits) {
      const onScreen = (queryClient.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() ?? 0) > 0
      if (onScreen) signalArrival(detail)
      else void queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' })
    }
  }
}

/**
 * PATCH /emails/:id {pinned, handled, read} (proposals §10.3 and §12.3, owner-only and per user, §12.1). The detail is
 * replaced with the response and every list copy patched in place; a handled or read change then settles list
 * membership (settleLists) and the unread counts.
 */
export async function updateEmail(id: string, patch: EmailPatch) {
  const detail = await api<EmailDetail>(`/emails/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  queryClient.setQueryData(['email', id], detail)
  patchEmailCache(queryClient, id, detail)
  if (patch.handled !== undefined || patch.read !== undefined) {
    settleLists(detail)
    void queryClient.invalidateQueries({ queryKey: ['glance'] }) // sidebar badge and lock glance counts
  }
  return detail
}

/** GET /emails/:id/ics (FR-ORC-017), saved through a temporary object URL; nothing is opened or rendered. */
export async function downloadIcs(id: string) {
  const blob = await apiBlob(`/emails/${id}/ics`, { headers: { Accept: 'text/calendar' } })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'meeting.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** GET /links/:checkId/go (FR-SEC-004). go_url is the full /api/v1 path; api() adds the base itself. */
export const followLink = (goUrl: string) => api<GoResponse>(goUrl.replace(/^\/api\/v1/, ''))

/** PATCH /emails/:id/labels (FR-ML-010, FR-UI-012). The new triage is patched into every cached copy, in place. */
export function useCorrectLabel(emailId: string) {
  return useMutation({
    mutationFn: (body: LabelCorrection) =>
      api<LabelCorrectionResponse>(`/emails/${emailId}/labels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: ({ triage }) => {
      patchEmailCache(queryClient, emailId, { triage })
    },
  })
}

// PROPOSED shapes (pending SRS v1.3), see api/types.ts.
export const useGlance = () => useQuery({ queryKey: ['glance'], queryFn: () => api<Glance>('/me/glance') })

export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: () => api<Page<AppNotification>>('/notifications') })

export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: () => api<Page<Project>>('/projects') })

/** PATCH /me/preferences, optimistic: the UI follows the click at once and rolls back if the server refuses. */
export function useUpdatePreferences() {
  return useMutation({
    mutationFn: (patch: UiPrefs) =>
      api<PreferencesResponse>('/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<Me>(['me'])
      if (previous) queryClient.setQueryData<Me>(['me'], { ...previous, ui_prefs: { ...previous.ui_prefs, ...patch } })
      return { previous }
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['me'], ctx.previous)
    },
    onSuccess: ({ ui_prefs }) => {
      const me = queryClient.getQueryData<Me>(['me'])
      if (me) queryClient.setQueryData<Me>(['me'], { ...me, ui_prefs: { ...ui_prefs } })
      // Glance hides or shows subjects depending on glance_subjects.
      void queryClient.invalidateQueries({ queryKey: ['glance'] })
    },
  })
}

// ── Layouts (FR-UI-010; PROPOSED, proposals §13) ──────────────────────────────────────────────────────────────

/** GET /layouts/:deviceClass. Never refetched on its own: the dashboard owns the local copy while editing. */
export const layoutOptions = (device: LayoutDeviceClass) =>
  queryOptions({
    queryKey: ['layout', device],
    queryFn: ({ signal }) => api<Layout>(`/layouts/${device}`, { signal }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

/** PUT /layouts/:deviceClass: a full replace, based on the version the edit started from (409 if it moved on). */
export const putLayout = (device: LayoutDeviceClass, body: LayoutPut) =>
  api<Layout>(`/layouts/${device}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
