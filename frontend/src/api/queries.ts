import { QueryClient, infiniteQueryOptions, keepPreviousData, queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, api, apiBlob } from './client'
import { patchActionCache, patchEmailCache, settleLists } from './realtime'
import type {
  BoardColumn,
  EmailProjectRef,
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
  ProjectInput,
  ProjectItem,
  ProjectPatch,
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

/** FR-UI-029: within ~10 s, deletes the created Jira issue or Calendar event; the action goes back to proposed. */
export const undoAction = (action: Pick<Action, 'id'>) =>
  api<Action>(`/actions/${action.id}/undo`, { method: 'POST' }).then((updated) => {
    patchActionCache(queryClient, updated)
    return updated
  })

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

/**
 * PATCH /emails/:id {pinned, handled, read} (proposals §10.3 and §12.3, owner-only and per user, §12.1). The detail is
 * replaced with the response and every list copy patched in place; a handled or read change then settles list
 * membership (settleLists) and the unread counts.
 */
export async function updateEmail(id: string, patch: EmailPatch, opts: { restore?: boolean } = {}) {
  const detail = await api<EmailDetail>(`/emails/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  queryClient.setQueryData(['email', id], detail)
  patchEmailCache(queryClient, id, detail)
  if (patch.handled !== undefined || patch.read !== undefined) {
    settleLists(queryClient, detail, opts)
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
  useQuery({ queryKey: ['projects'], queryFn: () => api<Page<Project>>('/projects?limit=50') })

// ── Projects (FR-UI-016–017; PROPOSED shapes, proposals §18) ──────────────────────────────────────────────────

/** GET /projects/:id. Seeded from the projects list, so the view opens at once. */
export const useProject = (id: string) =>
  useQuery({
    queryKey: ['project', id],
    queryFn: () => api<Project>(`/projects/${id}`),
    initialData: () => queryClient.getQueryData<Page<Project>>(['projects'])?.items.find((p) => p.id === id),
    initialDataUpdatedAt: () => queryClient.getQueryState(['projects'])?.dataUpdatedAt,
  })

function storeProject(project: Project) {
  queryClient.setQueryData(['project', project.id], project)
  queryClient.setQueryData<Page<Project>>(['projects'], (list) => {
    if (!list) return list
    const has = list.items.some((p) => p.id === project.id)
    return { ...list, items: has ? list.items.map((p) => (p.id === project.id ? project : p)) : [...list.items, project] }
  })
  return project
}

/** POST /projects. */
export const createProject = (input: ProjectInput) => api<Project>('/projects', json(input)).then(storeProject)

/** PATCH /projects/:id: edit, or archive with `{archived: true}` (archiving replaces deletion, FR-UI-016). */
export const patchProject = (id: string, patch: ProjectPatch) =>
  api<Project>(`/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(storeProject)

/** An email's project list after adding or removing one, in the wire order: primary first (FR-UI-017). */
export function withProject(refs: readonly EmailProjectRef[], project: Pick<Project, 'id' | 'name' | 'colour'>, add: boolean): EmailProjectRef[] {
  if (!add) {
    const rest = refs.filter((r) => r.id !== project.id)
    // The primary left: the next oldest becomes primary, as the server does.
    return rest.length && !rest.some((r) => r.is_primary) ? rest.map((r, i) => ({ ...r, is_primary: i === 0 })) : rest
  }
  if (refs.some((r) => r.id === project.id)) return [...refs]
  return [...refs, { id: project.id, name: project.name, colour: project.colour, is_primary: refs.length === 0 }]
}

/** The projects an email belongs to, wherever the client holds it. */
export function emailProjects(id: string): EmailProjectRef[] {
  const detail = queryClient.getQueryData<EmailDetail>(['email', id])
  if (detail) return detail.projects
  for (const [, data] of queryClient.getQueriesData<{ pages: Page<EmailListItem>[] } | Page<EmailListItem>>({ queryKey: ['emails'] })) {
    if (!data) continue
    const pages = 'pages' in data ? data.pages : [data]
    const hit = pages.flatMap((p) => p.items).find((e) => e.id === id)
    if (hit) return hit.projects
  }
  return []
}

/**
 * Adds emails to a project, or removes them (POST /projects/:id/items, DELETE /projects/:id/items/:itemId). Every
 * cached copy of each email is patched in place (never reordered), then the project's counts and lists refresh.
 */
export async function setEmailsInProject(project: Pick<Project, 'id' | 'name' | 'colour'>, ids: readonly string[], add: boolean) {
  await Promise.all(
    ids.map((id) =>
      add
        ? api<ProjectItem>(`/projects/${project.id}/items`, json({ email_id: id }))
        : api<void>(`/projects/${project.id}/items/${id}`, { method: 'DELETE' }),
    ),
  )
  for (const id of ids) patchEmailCache(queryClient, id, { projects: withProject(emailProjects(id), project, add) })
  void queryClient.invalidateQueries({ queryKey: ['projects'] })
  void queryClient.invalidateQueries({ queryKey: ['project', project.id] })
  // A project's own email list (project=id) gains or loses them: reload it the next time it's shown.
  void queryClient.invalidateQueries({ queryKey: ['emails', 'list'], predicate: (q) => String(q.queryKey[2] ?? '').includes(`project=${project.id}`) })
}

// ── Board (FR-ORC-007) ─────────────────────────────────────────────────────────────────────────────────────────

/** Every page of a list (lists are capped at 50 items a page, §6.4.1). */
async function fetchAll<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  do {
    const sep = path.includes('?') ? '&' : '?'
    const page: Page<T> = await api<Page<T>>(`${path}${sep}limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal })
    items.push(...page.items)
    cursor = page.next_cursor
  } while (cursor && items.length < 1_000)
  return items
}

/**
 * The board's cards: done actions placed in a column (GET /actions?status=done), optionally only a project's
 * (`project`, PROPOSED proposals §18.3). Live changes arrive as action.updated and patch the list.
 */
export const boardOptions = (project?: string) =>
  queryOptions({
    queryKey: ['actions', 'board', project ?? null],
    queryFn: ({ signal }) => fetchAll<Action>(`/actions?status=done${project ? `&project=${project}` : ''}`, signal).then((items) => ({ items, next_cursor: null }) as Page<Action>),
    staleTime: 30_000,
  })

/**
 * PATCH /actions/:id {board_column, board_position} (FR-ORC-007): a move on the board, applied to every cached board
 * first. `position` is the card's index among the other cards of that column, over all the user's cards (positions
 * are dense per user, so a project's board computes it with boardPosition). Every board then reloads, so a
 * project's board and the full board agree on the order.
 */
export async function moveCard(action: Action, column: BoardColumn, position: number) {
  const before = queryClient.getQueriesData<Page<Action>>({ queryKey: ['actions', 'board'] })
  for (const [key, data] of before) if (data) queryClient.setQueryData(key, { ...data, items: placeCard(data.items, action.id, column, position) })
  try {
    const updated = await api<Action>(`/actions/${action.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_column: column, board_position: position }),
    })
    patchActionCache(queryClient, updated)
    void queryClient.invalidateQueries({ queryKey: ['actions', 'board'] })
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
    void queryClient.invalidateQueries({ queryKey: ['project'] })
    void queryClient.invalidateQueries({ queryKey: ['glance'] })
    return updated
  } catch (err) {
    for (const [key, data] of before) queryClient.setQueryData(key, data)
    throw err
  }
}

/**
 * The server position for a card dropped in `column` just before `next` (or at the end, after `last`), from those
 * cards' own board_position. Works on a board that shows only some of the user's cards (a project's board).
 */
export function boardPosition(card: Pick<Action, 'board_column' | 'board_position'>, column: BoardColumn, next: Action | null, last: Action | null): number {
  const self = card.board_column === column ? (card.board_position ?? Infinity) : Infinity
  if (next) return Math.max(0, (next.board_position ?? 0) - (self < (next.board_position ?? 0) ? 1 : 0))
  if (last) return Math.max(0, (last.board_position ?? 0) + 1 - (self <= (last.board_position ?? 0) ? 1 : 0))
  return 0
}

/**
 * A board after moving one card to `position` in `column`, with the server's own arithmetic per card (M6 boardMove):
 * the column it left closes the gap, the column it joins makes room. Exact on a board showing only some of the
 * user's cards too (a project's), because positions are the user's global ones. Pure.
 */
export function placeCard(items: readonly Action[], id: string, column: BoardColumn, position: number): Action[] {
  const card = items.find((a) => a.id === id)
  if (!card) return [...items]
  const from = card.board_column
  const self = card.board_position ?? Infinity
  return items.map((a) => {
    if (a.id === id) return { ...a, board_column: column, board_position: position }
    if (a.board_column === null || a.board_position === null) return a
    // Rank among the others once the card has left its old place.
    const rank = a.board_column === from && a.board_position > self ? a.board_position - 1 : a.board_position
    if (a.board_column === column) return { ...a, board_position: rank >= position ? rank + 1 : rank }
    return rank === a.board_position ? a : { ...a, board_position: rank }
  })
}

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
