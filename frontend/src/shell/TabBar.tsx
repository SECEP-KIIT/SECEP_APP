import { Ellipsis } from 'lucide-react'
import { NavLink } from 'react-router'
import { useGlance, useMe } from '../api/queries'
import { visibleNav } from './nav'

// Phones (FR-UI-001): the sidebar becomes a bottom tab bar, with the same gating as the sidebar (nav.ts).
// Four primary tabs; the rest (Metrics, Admin, Settings, projects) sit under More.
export function TabBar() {
  const { data: me } = useMe()
  const { data: glance } = useGlance()
  const critical = glance?.counts.critical_unread ?? 0

  return (
    <nav className="tabbar" aria-label="Main">
      {visibleNav(me)
        .slice(0, 4)
        .map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="tab">
            <span className="nav-icon">
              <Icon aria-hidden="true" size={22} />
              {to === '/inbox' && critical > 0 && <span className="crit-dot" aria-hidden="true" />}
            </span>
            <span className="tab-label">{label}</span>
            {to === '/inbox' && critical > 0 && <span className="sr-only">, {critical} Critical unread</span>}
          </NavLink>
        ))}
      <NavLink to="/more" className="tab">
        <span className="nav-icon">
          <Ellipsis aria-hidden="true" size={22} />
        </span>
        <span className="tab-label">More</span>
      </NavLink>
    </nav>
  )
}
