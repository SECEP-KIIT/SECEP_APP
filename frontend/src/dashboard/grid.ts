// Grid geometry shared by the dashboard and the mock's starter layouts (proposals §13). Pure, unit-tested.
import type { LayoutDeviceClass, Widget } from '../api/types'

/** Desktop and tablet tile on the same 12-column grid (tablet doesn't use phone slots). */
export const GRID_COLS = 12
/** Rows of the desktop/tablet grid that fit one screen; the row height follows the page height. */
export const GRID_ROWS_PER_SCREEN = 12
export const GRID_MAX_H = 48
/** Phone: 2 × 4 slots per screen (FR-UI-009). Short screens show 3 rows at a time instead of cramming 4. */
export const PHONE_COLS = 2
export const PHONE_ROWS = 4

export type SizeName = 'small' | 'medium' | 'large'
type Box = Pick<Widget, 'x' | 'y' | 'w' | 'h'>

/** Size presets. Phone slots: half × 1 card, full × 1 card, full × 2 cards (FR-UI-009). */
export const SIZES: Record<'grid' | 'phone', Record<SizeName, { w: number; h: number }>> = {
  grid: { small: { w: 4, h: 6 }, medium: { w: 4, h: 12 }, large: { w: 8, h: 12 } },
  phone: { small: { w: 1, h: 1 }, medium: { w: 2, h: 1 }, large: { w: 2, h: 2 } },
}

export const isPhoneLayout = (device: LayoutDeviceClass) => device === 'phone'
export const sizesFor = (device: LayoutDeviceClass) => SIZES[isPhoneLayout(device) ? 'phone' : 'grid']

/** The preset a widget's size matches, or null for a custom (resized) size. */
export function sizeNameOf(device: LayoutDeviceClass, w: Pick<Widget, 'w' | 'h'>): SizeName | null {
  const sizes = sizesFor(device)
  return (Object.keys(sizes) as SizeName[]).find((k) => sizes[k].w === w.w && sizes[k].h === w.h) ?? null
}

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * The first free position for a w × h box, scanning rows top to bottom, then columns. On the phone the page has a
 * fixed 4 rows, so this returns null when nothing fits; the grid grows downwards instead.
 */
export function firstFit(taken: Box[], size: { w: number; h: number }, device: LayoutDeviceClass): { x: number; y: number } | null {
  const cols = isPhoneLayout(device) ? PHONE_COLS : GRID_COLS
  const maxY = isPhoneLayout(device) ? PHONE_ROWS - size.h : Math.max(0, ...taken.map((t) => t.y + t.h))
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x + size.w <= cols; x++) {
      const box = { x, y, ...size }
      if (!taken.some((t) => overlaps(t, box))) return { x, y }
    }
  }
  return null
}

/** Free phone slots (1 × 1) on a page, for the ghost outlines in phone edit mode. */
export function freeSlots(taken: Box[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < PHONE_ROWS; y++) {
    for (let x = 0; x < PHONE_COLS; x++) if (!taken.some((t) => overlaps(t, { x, y, w: 1, h: 1 }))) out.push({ x, y })
  }
  return out
}

/** Phone rows per screen: 4 when each row gets at least `minRow` px, else 3 (a short screen such as 360 × 480). */
export function phoneRowsFor(availableHeight: number, gap: number, minRow: number): 3 | 4 {
  return (availableHeight - 3 * gap) / 4 >= minRow ? 4 : 3
}
