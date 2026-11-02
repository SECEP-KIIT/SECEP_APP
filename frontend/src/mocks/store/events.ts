// Server-side event bus of the mock: store mutations publish here, the Socket.io mock delivers to room user:{id}.
type Listener = (userId: string, event: string, payload: unknown) => void
const listeners = new Set<Listener>()

export function publish(userId: string, event: string, payload: unknown) {
  for (const l of listeners) l(userId, event, payload)
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
