// Layout edits as pure functions over the §13 shape (pages → widgets). The dashboard keeps one local copy and saves
// it whole (PUT is a full replace). Unit-tested in dashboard.test.ts.
import type { LayoutDeviceClass, LayoutPage, Swatch, Widget, WidgetType } from '../api/types'
import { firstFit, isPhoneLayout, overlaps, PHONE_COLS, PHONE_ROWS, sizesFor, type SizeName } from './grid'

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
export const removePage = (pages: LayoutPage[], id: string) => (pages.length <= 1 ? pages : renumber(pages.filter((p) => p.id !== id)))

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

function place(page: LayoutPage, w: Omit<Widget, 'x' | 'y'>, device: LayoutDeviceClass): LayoutPage | null {
  if (page.widgets.length >= MAX_WIDGETS) return null
  const at = firstFit(page.widgets, w, device)
  return at ? { ...page, widgets: [...page.widgets, { ...w, ...at }] } : null
}

/** Adds a widget at the first free place; null when the page is full (the cap, or no free phone slot). */
export function addWidget(page: LayoutPage, preset: WidgetPreset, device: LayoutDeviceClass, size: SizeName = 'medium'): LayoutPage | null {
  const dims = sizesFor(device)[size]
  return place(page, { id: newId(), type: 'inbox_column', title: preset.title, icon: preset.icon, colour: preset.colour, filter: preset.filter, sort: preset.sort, density: null, ...dims }, device)
}

export function duplicateWidget(page: LayoutPage, id: string, device: LayoutDeviceClass): LayoutPage | null {
  const w = page.widgets.find((x) => x.id === id)
  if (!w) return null
  const { x: _x, y: _y, ...rest } = w
  return place(page, { ...rest, id: newId() }, device)
}

export const removeWidget = (page: LayoutPage, id: string): LayoutPage => ({ ...page, widgets: page.widgets.filter((w) => w.id !== id) })

export const patchWidget = (page: LayoutPage, id: string, patch: Partial<Omit<Widget, 'id' | 'type'>>): LayoutPage => ({
  ...page,
  widgets: page.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
})

/**
 * Applies a size preset. On the grid the tile keeps its place (the grid compacts around it). On the phone it stays
 * put if it fits there, otherwise it moves to the first slot that fits; null if none does.
 */
export function resizeWidget(page: LayoutPage, id: string, size: SizeName, device: LayoutDeviceClass): LayoutPage | null {
  const w = page.widgets.find((x) => x.id === id)
  if (!w) return null
  const dims = sizesFor(device)[size]
  if (!isPhoneLayout(device)) return patchWidget(page, id, dims)
  const others = page.widgets.filter((x) => x.id !== id)
  const inPlace = { x: Math.min(w.x, PHONE_COLS - dims.w), y: Math.min(w.y, PHONE_ROWS - dims.h), ...dims }
  if (!others.some((o) => overlaps(o, inPlace))) return patchWidget(page, id, inPlace)
  const at = firstFit(others, dims, device)
  return at ? patchWidget(page, id, { ...dims, ...at }) : null
}

/** Takes the positions react-grid-layout reports after a drag or resize. */
export function applyGrid(page: LayoutPage, items: readonly { i: string; x: number; y: number; w: number; h: number }[]): LayoutPage {
  const by = new Map(items.map((it) => [it.i, it]))
  let changed = false
  const widgets = page.widgets.map((w) => {
    const it = by.get(w.id)
    if (!it || (it.x === w.x && it.y === w.y && it.w === w.w && it.h === w.h)) return w
    changed = true
    return { ...w, x: it.x, y: it.y, w: it.w, h: it.h }
  })
  return changed ? { ...page, widgets } : page
}

/** Phone edit mode (FR-UI-009): moves a widget so its top-left is the tapped slot; null if it doesn't fit there. */
export function moveToSlot(page: LayoutPage, id: string, slot: { x: number; y: number }): LayoutPage | null {
  const w = page.widgets.find((x) => x.id === id)
  if (!w) return null
  const box = { x: slot.x, y: slot.y, w: w.w, h: w.h }
  if (box.x + box.w > PHONE_COLS || box.y + box.h > PHONE_ROWS) return null
  if (page.widgets.some((o) => o.id !== id && overlaps(o, box))) return null
  return patchWidget(page, id, { x: box.x, y: box.y })
}
