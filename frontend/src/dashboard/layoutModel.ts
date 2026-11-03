// Layout edits as pure functions over the layout shape (pages → ordered widgets, proposals §13 and §16.3). The
// dashboard keeps one local copy and saves it whole (PUT is a full replace). Unit-tested in dashboard.test.ts.
import type { LayoutPage, Swatch, Widget, WidgetSize, WidgetType } from '../api/types'

/** Caps, the same as the server's (task 8 decision). Ctrl+1…9 reaches every page. */
export const MAX_PAGES = 9
export const MAX_WIDGETS = 24

/** The 8 named swatches (FR-UI-008). Each has a visible name in the menu, so the colour is never the only cue. */
export const SWATCHES: { key: Swatch; label: string }[] = [
  { key: 'slate', label: 'Slate' },
  { key: 'blue', label: 'Blue' },
  { key: 'teal', label: 'Teal' },
  { key: 'green', label: 'Green' },
  { key: 'amber', label: 'Amber' },
  { key: 'orange', label: 'Orange' },
  { key: 'red', label: 'Red' },
  { key: 'violet', label: 'Violet' },
]

/** Emoji offered in the icon picker. Any single emoji is valid on the wire. */
export const ICONS = ['📥', '📬', '🔥', '📅', '🗓️', '⏰', '↩️', '🧐', '🛡️', '⭐', '📌', '💼', '📊', '✈️', '🧭', '💬', '✅', '🧾', '🔔', '🏷️', '📎', '🗂️', '⚡', '🌙']

const DEFAULT_TITLE: Record<WidgetType, string> = {
  inbox_column: 'Inbox',
  board: 'Board',
  projects: 'Projects',
  reminders: 'Reminders',
  calendar: 'Calendar',
  notes: 'Notes',
  stats: 'Stats',
  security: 'Security',
}
export const widgetTitle = (w: Pick<Widget, 'type' | 'title'>) => w.title ?? DEFAULT_TITLE[w.type]

/** ⤢: the /inbox full view with this column's filter and sort, in the GET /emails vocabulary. */
export function fullViewHref(w: Pick<Widget, 'filter' | 'sort'>) {
  const parts = [w.filter, w.sort && w.sort !== 'newest' ? `sort=${w.sort}` : ''].filter(Boolean)
  return parts.length ? `/inbox?${parts.join('&')}` : '/inbox'
}

/** Widget types the client can render today. The gallery offers only these; tasks 10–15 add theirs. */
export const BUILT_TYPES: WidgetType[] = ['inbox_column']

export interface WidgetPreset {
  key: string
  title: string
  icon: string
  colour: Swatch | null
  /** GET /emails filter parameters (proposals §13). */
  filter: string
  sort: Widget['sort']
}

/** Gallery entries: inbox columns as saved filters (FR-UI-006), in the GET /emails vocabulary. */
export const COLUMN_PRESETS: WidgetPreset[] = [
  { key: 'inbox', title: 'Inbox', icon: '📥', colour: null, filter: '', sort: 'newest' },
  { key: 'unread', title: 'Unread', icon: '📬', colour: 'blue', filter: 'view=unread', sort: 'newest' },
  { key: 'critical', title: 'Critical + High', icon: '🔥', colour: 'red', filter: 'urgency=Critical,High', sort: 'newest' },
  { key: 'due', title: 'Due today', icon: '📅', colour: 'amber', filter: 'view=due_today', sort: 'newest' },
  { key: 'overdue', title: 'Overdue', icon: '⏰', colour: 'orange', filter: 'view=overdue', sort: 'newest' },
  { key: 'reply', title: 'Needs my reply', icon: '↩️', colour: 'teal', filter: 'view=needs_reply', sort: 'newest' },
  { key: 'week', title: 'Due this week', icon: '🗓️', colour: 'amber', filter: 'due=next_7_days', sort: 'newest' },
  { key: 'review', title: 'Needs review', icon: '🧐', colour: 'violet', filter: 'needs_review=true', sort: 'confidence' },
  { key: 'security', title: 'Security-flagged', icon: '🛡️', colour: 'slate', filter: 'flag=suspicious,malicious', sort: 'newest' },
  { key: 'handled', title: 'Handled', icon: '✅', colour: 'green', filter: 'view=handled', sort: 'newest' },
]

export const newId = () => crypto.randomUUID()
export const sortedPages = (pages: LayoutPage[]) => [...pages].sort((a, b) => a.order - b.order)
const renumber = (pages: LayoutPage[]) => sortedPages(pages).map((p, order) => ({ ...p, order }))

export function addPage(pages: LayoutPage[], name?: string): LayoutPage[] | null {
  if (pages.length >= MAX_PAGES) return null
  return renumber([...pages, { id: newId(), name: name ?? `Page ${pages.length + 1}`, order: pages.length, widgets: [] }])
}

export const renamePage = (pages: LayoutPage[], id: string, name: string) =>
  pages.map((p) => (p.id === id && name.trim() ? { ...p, name: name.trim().slice(0, 40) } : p))

/** Removes a page; the last page can't be removed (a layout has at least one). */
/** Removes a page; the last page can't be removed (a layout has at least one). */
export const removePage = (pages: LayoutPage[], id: string) => (pages.length <= 1 ? pages : renumber(pages.filter((p) => p.id !== id)))

/** Undo of a removal (FR-UI-029 pattern): the page goes back where it was. null if the page cap was reached since. */
export function restorePage(pages: LayoutPage[], page: LayoutPage): LayoutPage[] | null {
  if (pages.length >= MAX_PAGES || pages.some((p) => p.id === page.id)) return null
  const list = sortedPages(pages)
  list.splice(Math.min(page.order, list.length), 0, page)
  return list.map((p, order) => ({ ...p, order }))
}

/** Moves a page one step left (-1) or right (+1). */
export function movePage(pages: LayoutPage[], id: string, by: -1 | 1): LayoutPage[] {
  const list = sortedPages(pages)
  const i = list.findIndex((p) => p.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return pages
  ;[list[i], list[j]] = [list[j], list[i]]
  return list.map((p, order) => ({ ...p, order }))
}

export const updatePage = (pages: LayoutPage[], id: string, fn: (p: LayoutPage) => LayoutPage | null) =>
  pages.map((p) => (p.id === id ? (fn(p) ?? p) : p))

/** Adds a widget at the end of the page; null when the page holds MAX_WIDGETS already. */
export function addWidget(page: LayoutPage, preset: WidgetPreset, size: WidgetSize = 'small'): LayoutPage | null {
  if (page.widgets.length >= MAX_WIDGETS) return null
  const w: Widget = { id: newId(), type: 'inbox_column', size, hidden: false, title: preset.title, icon: preset.icon, colour: preset.colour, filter: preset.filter, sort: preset.sort, density: null }
  return { ...page, widgets: [...page.widgets, w] }
}

/** A copy right after the original. */
export function duplicateWidget(page: LayoutPage, id: string): LayoutPage | null {
  const i = page.widgets.findIndex((x) => x.id === id)
  if (i < 0 || page.widgets.length >= MAX_WIDGETS) return null
  const widgets = [...page.widgets]
  widgets.splice(i + 1, 0, { ...page.widgets[i], id: newId() })
  return { ...page, widgets }
}

export const removeWidget = (page: LayoutPage, id: string): LayoutPage => ({ ...page, widgets: page.widgets.filter((w) => w.id !== id) })

export const patchWidget = (page: LayoutPage, id: string, patch: Partial<Omit<Widget, 'id' | 'type'>>): LayoutPage => ({
  ...page,
  widgets: page.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
})

/**
 * Dragging a tile onto another (proposals §16.3). Same-size tiles swap places. Otherwise the dragged tile takes the
 * target's place in the order and the tiles from there on move one along; the flow then pushes them right and down.
 * The same page object comes back when nothing changes, so hovering a tile's own place saves nothing.
 */
export function reorderWidget(page: LayoutPage, activeId: string, overId: string): LayoutPage {
  const from = page.widgets.findIndex((w) => w.id === activeId)
  const to = page.widgets.findIndex((w) => w.id === overId)
  if (from < 0 || to < 0 || from === to) return page
  const widgets = [...page.widgets]
  if (widgets[from].size === widgets[to].size) {
    ;[widgets[from], widgets[to]] = [widgets[to], widgets[from]]
  } else {
    const [moved] = widgets.splice(from, 1)
    widgets.splice(to, 0, moved)
  }
  return { ...page, widgets }
}

/** Phone edit sheet (proposals §16.4): a section dragged to another place in the list; the rest close up. */
export function moveWidget(page: LayoutPage, from: number, to: number): LayoutPage {
  if (from === to || from < 0 || to < 0 || from >= page.widgets.length || to >= page.widgets.length) return page
  const widgets = [...page.widgets]
  const [moved] = widgets.splice(from, 1)
  widgets.splice(to, 0, moved)
  return { ...page, widgets }
}
