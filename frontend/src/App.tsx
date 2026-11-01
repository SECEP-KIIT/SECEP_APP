import { QueryClientProvider } from '@tanstack/react-query'
import { Navigate, createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { queryClient } from './api/queries'
import { Shell } from './shell/Shell'

// Every page is a lazy route (its own chunk, NFR-PERF-010); the shell stays in the main bundle.
// `handle.title` feeds the topbar.
const placeholder = () => import('./pages/Placeholder')

const router = createBrowserRouter([
  {
    path: '/',
    Component: Shell,
    hydrateFallbackElement: <div className="boot" aria-busy="true" />,
    children: [
      { index: true, element: <Navigate to="/inbox" replace /> },
      { path: 'inbox', lazy: () => import('./pages/Inbox'), handle: { title: 'Inbox' } },
      { path: 'board', lazy: placeholder, handle: { title: 'Board' } },
      { path: 'security', lazy: placeholder, handle: { title: 'Security' } },
      { path: 'metrics', lazy: placeholder, handle: { title: 'Metrics' } },
      { path: 'admin', lazy: placeholder, handle: { title: 'Admin' } },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
