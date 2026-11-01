import { ChartColumn, Inbox, Settings, ShieldAlert, SquareKanban, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { useMe } from '../api/queries'
import type { Me } from '../api/types'

interface Item {
  to: string
  label: string
  icon: LucideIcon
  visible?: (me: Me) => boolean
}

// FR-UI-002, minus Calendar (an S page; not listed until it exists). Hiding items is only a convenience:
// the API enforces RBAC and returns 403 regardless (FR-ADM-005).
const ITEMS: Item[] = [
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/board', label: 'Board', icon: SquareKanban },
  { to: '/security', label: 'Security', icon: ShieldAlert, visible: (me) => me.permissions.includes('security.review') },
  // GET /admin/metrics is admin-only (§6.5), so the page is too.
  { to: '/metrics', label: 'Metrics', icon: ChartColumn, visible: (me) => me.is_admin },
  { to: '/admin', label: 'Admin', icon: Settings, visible: (me) => me.is_admin },
]

export function Sidebar() {
  const { data: me } = useMe()
  const items = ITEMS.filter((item) => !item.visible || (me && item.visible(me)))
  const name = me?.display_name ?? me?.email

  return (
    <nav className="sidebar" aria-label="Main">
      <ul>
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to} className="nav-link">
              <Icon aria-hidden="true" size={20} />
              <span className="nav-label">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      {name && (
        <div className="sidebar-user" title={me?.email}>
          <span className="avatar" aria-hidden="true">
            {name[0].toUpperCase()}
          </span>
          <span className="nav-label">{name}</span>
        </div>
      )}
    </nav>
  )
}
