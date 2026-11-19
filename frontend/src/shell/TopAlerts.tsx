import { AlarmClock, CalendarClock, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { markNotificationsRead } from '../api/queries'
import { onAlert, type TopAlert } from '../lib/alertBus'
import { openNotificationTarget } from '../lib/openTarget'

const SHOW_MS = 12_000
const MAX = 3

/**
 * Reminders and meetings that fire drop in from the top of the screen (FR-REM-004) and stay until dismissed or
 * 12 s pass; the bell keeps them either way. Shape icon + text, never colour alone. Motion is transform and opacity.
 */
export function TopAlerts() {
  const [alerts, setAlerts] = useState<TopAlert[]>([])
  const { pathname } = useLocation()
  useEffect(
    () =>
      onAlert((a) => {
        setAlerts((cur) => [a, ...cur.filter((x) => x.id !== a.id)].slice(0, MAX))
        setTimeout(() => setAlerts((cur) => cur.filter((x) => x.id !== a.id)), SHOW_MS)
      }),
    [],
  )
  if (alerts.length === 0) return null
  const dismiss = (id: string) => setAlerts((cur) => cur.filter((x) => x.id !== id))
  return (
    <div className="top-alerts" role="region" aria-label="Reminders">
      {alerts.map((a) => (
        <div key={a.id} className="top-alert" role="alert">
          {a.title.startsWith('Meeting') ? <CalendarClock size={18} aria-hidden="true" /> : <AlarmClock size={18} aria-hidden="true" />}
          <button
            type="button"
            className="top-alert-main"
            onClick={() => {
              dismiss(a.id)
              void markNotificationsRead([a.id]).catch(() => {})
              openNotificationTarget(a.target, pathname)
            }}
          >
            <strong>{a.title}</strong>
            {a.body && <span>{a.body}</span>}
          </button>
          <button type="button" className="toast-close" onClick={() => dismiss(a.id)} aria-label="Dismiss">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
