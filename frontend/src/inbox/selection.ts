// Card selection (FR-UI-027, item 8), one per inbox page. Pure helpers here are unit-tested in cardModel.test.ts.
import { createContext, useContext } from 'react'

export interface SelectionApi {
  selected: ReadonlySet<string>
  /** Ctrl/⌘+click or `x`: add or remove one card; it becomes the anchor for Shift+click. */
  toggle: (id: string) => void
  /** Shift+click: everything between the anchor and `id` in this column's order (the anchor stays). */
  range: (id: string, order: readonly string[]) => void
  /** Ctrl/⌘+A in a column. */
  set: (ids: readonly string[]) => void
  clear: () => void
}

export const SelectionContext = createContext<SelectionApi>({ selected: new Set(), toggle: () => {}, range: () => {}, set: () => {}, clear: () => {} })
export const useSelection = () => useContext(SelectionContext)

/** Adds the run between anchor and target (inclusive) to the selection. No anchor in this order: just the target. */
export function selectRange(selected: ReadonlySet<string>, anchor: string | null, target: string, order: readonly string[]): Set<string> {
  const next = new Set(selected)
  const a = anchor ? order.indexOf(anchor) : -1
  const b = order.indexOf(target)
  if (b < 0) return next
  if (a < 0) return next.add(target)
  for (const id of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(id)
  return next
}

/** Card ids in a column, in list order (the rendered rows; the list is virtualised). */
export function columnOrder(el: Element | null): string[] {
  const rows = el?.closest('.column')?.querySelectorAll<HTMLElement>('[data-email-id]') ?? []
  return [...rows].sort((x, y) => Number(x.dataset.pos) - Number(y.dataset.pos)).map((r) => r.dataset.emailId!)
}
