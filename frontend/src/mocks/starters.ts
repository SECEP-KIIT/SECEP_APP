// Starter pages (FR-UI-007, task 8 decision): what GET /layouts/:deviceClass returns while nothing is saved.
// Data, not code: later tasks add their widgets here (Board in task 10, Calendar in task 14). Only widget types that
// exist today are listed. Filters use the GET /emails query vocabulary (proposals §13).
import type { Layout, LayoutDeviceClass, LayoutPage, Widget } from '../api/types'
import { firstFit, isPhoneLayout, SIZES, type SizeName } from '../dashboard/grid'
import { uid } from './store/random'

interface StarterWidget extends Pick<Widget, 'type' | 'title' | 'colour' | 'icon' | 'filter' | 'sort' | 'density'> {
  /** Size on the 12-column grid (desktop, tablet) and in phone slots. */
  size: { grid: SizeName; phone: SizeName }
}

const column = (title: string, icon: string, colour: Widget['colour'], filter: string, sort: Widget['sort'], phone: SizeName): StarterWidget => ({
  type: 'inbox_column', title, icon, colour, filter, sort, density: null, size: { grid: 'medium', phone },
})

export const STARTERS: { name: string; widgets: StarterWidget[] }[] = [
  {
    name: 'Today',
    widgets: [
      // Handled mail is outside every list except the Handled view, so "not handled" needs no parameter.
      column('Critical + High', '🔥', 'red', 'urgency=Critical,High', 'newest', 'large'),
      column('Due today', '📅', 'amber', 'view=due_today', 'newest', 'medium'),
      column('Overdue', '⏰', 'orange', 'view=overdue', 'newest', 'medium'),
    ],
  },
  {
    name: 'Triage',
    widgets: [
      column('Unread', '📬', 'blue', 'view=unread', 'newest', 'large'),
      // No needs_review filter exists in GET /emails; least-confident first puts those emails on top (§13, flagged).
      column('Needs review', '🧐', 'violet', '', 'confidence', 'medium'),
      column('Security-flagged', '🛡️', 'slate', 'flag=suspicious,malicious', 'newest', 'medium'),
    ],
  },
  {
    name: 'Planning',
    widgets: [
      // "Due this week" is decided but has no GET /emails parameter yet (proposals §14); added once it does.
      column('Needs my reply', '↩️', 'teal', 'view=needs_reply', 'newest', 'large'),
    ],
  },
]

const NS_LAYOUT = 11

/** The starter layout for one device class. Ids are stable, so two GETs of the default return the same layout. */
export function starterLayout(device: LayoutDeviceClass): Layout {
  let n = 0
  const pages: LayoutPage[] = STARTERS.map((page, order) => {
    const widgets: Widget[] = []
    for (const { size, ...w } of page.widgets) {
      const dims = SIZES[isPhoneLayout(device) ? 'phone' : 'grid'][isPhoneLayout(device) ? size.phone : size.grid]
      // Tablet keeps the 12-column grid with two tiles per row.
      const box = device === 'tablet' ? { ...dims, w: 6 } : dims
      const at = firstFit(widgets, box, device)
      if (!at) continue // a phone page holds at most 2 × 4 slots
      widgets.push({ id: uid(NS_LAYOUT, ++n), ...w, ...box, ...at })
    }
    return { id: uid(NS_LAYOUT, 1000 + order), name: page.name, order, widgets }
  })
  return { device_class: device, pages, updated_at: null, is_default: true }
}
