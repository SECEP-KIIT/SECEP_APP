import { QueryClient, infiniteQueryOptions, keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, api } from './client'
import { patchEmailCache } from './realtime'
import type {
  AppNotification,
  EmailListItem,
  Glance,
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
