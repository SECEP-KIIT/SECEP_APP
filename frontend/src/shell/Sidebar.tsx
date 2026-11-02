import { PanelLeftClose, PanelLeftOpen, Settings, UserCog } from 'lucide-react'
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import { NavLink } from 'react-router'
import { useGlance, useMe, useProjects, useUpdatePreferences } from '../api/queries'
import { isAdmin, visibleNav } from './nav'
import { usePrefs } from './prefs'
import { ProgressRing } from './ProgressRing'

const PEEK_INTENT_MS = 150
const PEEK_LEAVE_MS = 200

/** Hover-peek (Arc style): a collapsed sidebar opens as an overlay after a short hover intent, without moving content. */
function usePeek(enabled: boolean) {
  const [peek, setPeek] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const later = (value: boolean, ms: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setPeek(value), ms)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // Expanded sidebars never peek; a stale `peek` from before expanding is simply ignored.
  if (!enabled) return { peek: false, handlers: {} }
  return {
    peek,
    handlers: {
      onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && later(true, PEEK_INTENT_MS),
      onPointerLeave: () => later(false, PEEK_LEAVE_MS),
      // Keyboard users get the labels too while focus is inside.
      onFocus: () => later(true, 0),
      onBlur: (e: FocusEvent) => !e.currentTarget.contains(e.relatedTarget) && later(false, 0),
    },
  }
}

/** Ambient urgency (FR-UI-005): steady glow while Critical is unread; three pulses each time the count goes up. */
function useCriticalGlow(critical: number) {
  const previous = useRef(critical)
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    if (critical > previous.current) setPulse((n) => n + 1)
    previous.current = critical
  }, [critical])
  return pulse
}

export function Sidebar() {
  const { data: me } = useMe()
  const { data: glance } = useGlance()
  const { data: projects } = useProjects()
  const { sidebar_collapsed: collapsed } = usePrefs()
  const updatePrefs = useUpdatePreferences()
  const { peek, handlers } = usePeek(collapsed)
  const critical = glance?.counts.critical_unread ?? 0
  const pulse = useCriticalGlow(critical)
  const name = me?.display_name ?? me?.email
  const active = (projects?.items ?? []).filter((p) => !p.archived_at)

  return (
    <nav
      className="sidebar"
      aria-label="Main"
      data-collapsed={collapsed || undefined}
      data-peek={peek || undefined}
      data-glow={critical > 0 || undefined}
      {...handlers}
    >
      {/* A new key restarts the pulse animation. The glow is pre-drawn and animates opacity only (item 9). */}
      <span className={pulse ? 'glow pulse' : 'glow'} key={pulse} aria-hidden="true" />
      <div className="sidebar-panel">
        <ul className="nav">
          {visibleNav(me).map(({ to, label, icon: Icon, count }) => {
            const n = glance && count ? count(glance) : null
            const showCritical = to === '/inbox' && critical > 0
            return (
              <li key={to}>
                <NavLink to={to} className="nav-link">
                  <span className="nav-icon">
                    <Icon aria-hidden="true" size={20} />
                    {showCritical && <span className="crit-dot" aria-hidden="true" />}
                  </span>
                  <span className="nav-label">{label}</span>
                  {showCritical && <span className="sr-only">, {critical} Critical unread</span>}
                  {n ? (
                    <span className="badge">
                      {n}
                      <span className="sr-only"> {to === '/inbox' ? 'unread' : 'items'}</span>
                    </span>
                  ) : null}
                </NavLink>
              </li>
            )
          })}
        </ul>

        {active.length > 0 && (
          <section className="nav-projects" aria-labelledby="nav-projects-title">
            <h2 id="nav-projects-title" className="nav-heading">
              <span className="nav-label">Projects</span>
            </h2>
            <ul className="nav">
              {active.map((p) => (
                <li key={p.id}>
                  <NavLink to={`/projects/${p.id}`} className="nav-link">
                    <span className="nav-icon">
                      <ProgressRing done={p.progress.done} total={p.progress.total} colour={p.colour} />
                    </span>
                    <span className="nav-label">{p.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ul className="nav nav-bottom">
          {name && (
            <li className="nav-user" title={me?.email}>
              <span className="nav-icon">
                <span className="avatar" aria-hidden="true">
                  {name[0].toUpperCase()}
                </span>
              </span>
              <span className="nav-label">{name}</span>
            </li>
          )}
          <li>
            <NavLink to="/settings" className="nav-link">
              <span className="nav-icon">
                <Settings aria-hidden="true" size={20} />
              </span>
              <span className="nav-label">Settings</span>
            </NavLink>
          </li>
          {me && isAdmin(me) && (
            <li>
              <NavLink to="/admin" className="nav-link">
                <span className="nav-icon">
                  <UserCog aria-hidden="true" size={20} />
                </span>
                <span className="nav-label">Admin</span>
              </NavLink>
            </li>
          )}
          <li>
            <button type="button" className="nav-link" onClick={() => updatePrefs.mutate({ sidebar_collapsed: !collapsed })}>
              <span className="nav-icon">
                {collapsed ? <PanelLeftOpen aria-hidden="true" size={20} /> : <PanelLeftClose aria-hidden="true" size={20} />}
              </span>
              <span className="nav-label">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  )
}
