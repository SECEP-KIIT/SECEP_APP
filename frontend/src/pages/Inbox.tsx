import { useEmails } from '../api/queries'

// THROWAWAY (task 3): a plain list that proves the MSW → api() → TanStack Query chain works in `npm run dev`.
// Deleted in task 6, when the real inbox (cards, filters, virtual list) replaces it.
export function Component() {
  const { data, isPending, error } = useEmails()

  if (isPending) return <p>Loading…</p>
  if (error) return <p role="alert">Couldn’t load the inbox: {error.message}</p>

  return (
    <ul>
      {data.items.map((e) => (
        <li key={e.id}>
          {e.from.name ?? e.from.address} · {e.subject ?? '(no subject)'} · {e.triage?.urgency.label ?? 'not triaged'}
        </li>
      ))}
    </ul>
  )
}
