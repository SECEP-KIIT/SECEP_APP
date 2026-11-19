// Pop-up alerts that drop in from the top of the screen (FR-REM-004): a reminder or meeting that fires. The shell's
// TopAlerts shows them; realtime.ts raises them. Plain events, like the toast bus.
import type { AppNotification } from '../api/types'

const EVENT = 'secep:alert'

export interface TopAlert {
  id: string
  title: string
  body: string | null
  target: AppNotification['target']
}

export const raiseAlert = (n: Pick<AppNotification, 'id' | 'title' | 'body' | 'target'>) =>
  dispatchEvent(new CustomEvent<TopAlert>(EVENT, { detail: { id: n.id, title: n.title, body: n.body, target: n.target } }))

export function onAlert(fn: (a: TopAlert) => void) {
  const handler = (e: Event) => fn((e as CustomEvent<TopAlert>).detail)
  addEventListener(EVENT, handler)
  return () => removeEventListener(EVENT, handler)
}
