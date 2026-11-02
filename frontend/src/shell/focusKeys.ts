// Focus mode keys (FR-UI-004): F toggles, Esc leaves. Pure, so it's unit-tested.

interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  target: EventTarget | null
}

/** Single-key shortcuts must never fire while the user is typing. */
export function isTypingTarget(target: EventTarget | null) {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null
  if (!el?.tagName) return false
  return el.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function focusKeyAction(e: KeyLike, focused: boolean): 'toggle' | 'exit' | null {
  // F9: inside an open dialog (drawer, legend) or a popover, keys belong to that layer. So Esc closes the layer
  // first, and only a later Esc, with nothing open, leaves Focus mode.
  if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || inLayer(e.target)) return null
  if (e.key === 'f' || e.key === 'F') return 'toggle'
  if (e.key === 'Escape' && focused) return 'exit'
  return null
}

function inLayer(target: EventTarget | null) {
  const el = target as { closest?: (selector: string) => unknown } | null
  return !!el?.closest?.('dialog[open], [data-radix-popper-content-wrapper]')
}
