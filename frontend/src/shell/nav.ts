import { CalendarDays, ChartColumn, Inbox, ShieldAlert, SquareKanban, type LucideIcon } from 'lucide-react'
import type { Glance, Me } from '../api/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  visible?: (me: Me) => boolean
  /** Count badge from GET /me/glance (FR-UI-002). */
  count?: (g: Glance) => number | null
}

export const canReviewSecurity = (me: Me) => me.permissions.includes('security.review')
export const isAdmin = (me: Me) => me.is_admin

// FR-UI-002 top section. Shared by the sidebar and the phone tab bar, so both apply the same gating.
// Hiding is a convenience only: the API enforces RBAC and returns 403 regardless (FR-ADM-005).
export const NAV: NavItem[] = [
  { to: '/inbox', label: 'Inbox', icon: Inbox, count: (g) => g.counts.inbox_unread },
  { to: '/board', label: 'Board', icon: SquareKanban, count: (g) => g.counts.board_todo },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/security', label: 'Security', icon: ShieldAlert, visible: canReviewSecurity, count: (g) => g.counts.security_flags },
  // GET /admin/metrics is admin-only (§6.5), so the page is too.
  { to: '/metrics', label: 'Metrics', icon: ChartColumn, visible: isAdmin },
]

export const visibleNav = (me: Me | undefined) => NAV.filter((i) => !i.visible || (me !== undefined && i.visible(me)))
