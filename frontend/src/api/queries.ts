import { QueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, api } from './client'
import type { AppNotification, EmailListItem, Glance, Me, Page, PreferencesResponse, Project, UiPrefs } from './types'

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

export const useEmails = () =>
  useQuery({ queryKey: ['emails'], queryFn: () => api<Page<EmailListItem>>('/emails') })

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
