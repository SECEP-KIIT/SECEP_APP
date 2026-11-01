import { QueryClient, useQuery } from '@tanstack/react-query'
import { ApiError, api } from './client'
import type { EmailListItem, Me, Page } from './types'

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
