import * as Popover from '@radix-ui/react-popover'
import { Copy, Ellipsis, Maximize2, Pencil, Trash2 } from 'lucide-react'
import { useContext, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { LayoutDeviceClass, Widget } from '../api/types'
import { filterQuery, parseColumnQuery, sortKeyOf, type ColumnState } from '../inbox/cardModel'
import { Column } from '../inbox/Column'
import { PortalContainer } from '../inbox/portal'
import { sizeNameOf, type SizeName } from './grid'
import { BUILT_TYPES, fullViewHref, ICONS, SWATCHES, widgetTitle } from './layoutModel'

const LONG_PRESS_MS = 500

export interface WidgetActions {
  patch: (patch: Partial<Omit<Widget, 'id' | 'type'>>) => void
  resize: (size: SizeName) => boolean
  duplicate: () => boolean
  remove: () => void
}

/**
 * One tile (FR-UI-006/008, item 2): a title bar with the widget's emoji, name and colour (a tinted bar plus a thin
 * left stripe), ⤢ to the full view, and the title-bar menu on ⋯, right-click or long-press: Rename (also a
 * double-click on the title), Colour, Icon, Size, Duplicate, Remove. Only inbox columns are built; any other saved
 * type shows a placeholder until its task lands.
 */
export function WidgetFrame({ widget, device, editing, actions }: { widget: Widget; device: LayoutDeviceClass; editing: boolean; actions: WidgetActions }) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const title = widgetTitle(widget)
  const stack = device === 'phone'

  // Long-press on the title bar opens the menu on touch (FR-UI-008).
  const press = useRef(0)
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    press.current = window.setTimeout(() => setMenu(true), LONG_PRESS_MS)
  }
  const cancelPress = () => clearTimeout(press.current)
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    setMenu(true)
  }

  const heading = (titleId: string) => (
    <div className="widget-bar" onContextMenu={onContextMenu} onPointerDown={onPointerDown} onPointerUp={cancelPress} onPointerLeave={cancelPress}>
      {widget.icon && (
        <span className="widget-icon" aria-hidden="true">
          {widget.icon}
        </span>
      )}
      {renaming ? (
        <RenameField
          initial={title}
          onDone={(name) => {
            setRenaming(false)
            if (name !== null && name !== title) actions.patch({ title: name })
          }}
        />
      ) : (
        <h2 className="col-title widget-title" id={titleId} tabIndex={-1} onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
          {title}
        </h2>
      )}
    </div>
  )

  const tools = (
    <span className="widget-tools">
      {widget.type === 'inbox_column' && !stack && (
        <Link className="col-tool" to={fullViewHref(widget)} title="Open as full view">
          <Maximize2 size={15} aria-hidden="true" />
          <span className="sr-only">Open {title} as full view</span>
        </Link>
      )}
      <WidgetMenu
        widget={widget}
        device={device}
        open={menu}
        onOpenChange={setMenu}
        onRename={() => {
          setMenu(false)
          setRenaming(true)
        }}
        actions={actions}
      />
    </span>
  )

  return (
    <div className="widget" data-swatch={widget.colour ?? undefined} data-editing={editing || undefined}>
      {widget.type === 'inbox_column' ? (
        <ColumnWidget widget={widget} title={title} heading={heading} tools={tools} stack={stack} onChange={actions.patch} />
      ) : (
        <section className="column widget-placeholder" aria-label={title}>
          <header className="col-head">
            <div className="col-title-row">
              {heading(`w-${widget.id}`)}
              {tools}
            </div>
          </header>
          <p className="col-state">{BUILT_TYPES.includes(widget.type) ? '' : `${title} isn't built yet. It arrives with its own task.`}</p>
        </section>
      )}
    </div>
  )
}

/** The column's filter, sort and density live in the widget, so every change is saved with the layout. */
function ColumnWidget({ widget, title, heading, tools, stack, onChange }: {
  widget: Widget
  title: string
  heading: (titleId: string) => ReactNode
  tools: ReactNode
  stack: boolean
  onChange: WidgetActions['patch']
}) {
  const state = useMemo<ColumnState>(
    () => ({ filters: parseColumnQuery(widget.filter ?? '').filters, sort: sortKeyOf(widget.sort), density: widget.density ?? 'comfortable' }),
    [widget.filter, widget.sort, widget.density],
  )
  return (
    <Column
      title={title}
      state={state}
      onStateChange={(s) => onChange({ filter: filterQuery(s.filters), sort: s.sort, density: s.density })}
      heading={heading}
      tools={tools}
      variant={stack ? 'stack' : 'full'}
    />
  )
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial)
  const finish = (save: boolean) => onDone(save && value.trim() ? value.trim().slice(0, 60) : null)
  return (
    <input
      className="widget-rename"
      aria-label="Widget name"
      value={value}
      maxLength={60}
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the user just asked to rename; focus belongs here
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          finish(false)
        }
      }}
    />
  )
}

const SIZE_LABEL: Record<SizeName, string> = { small: 'Small', medium: 'Medium', large: 'Large' }

function WidgetMenu({ widget, device, open, onOpenChange, onRename, actions }: {
  widget: Widget
  device: LayoutDeviceClass
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename: () => void
  actions: WidgetActions
}) {
  const container = useContext(PortalContainer)
  const [note, setNote] = useState<string | null>(null)
  const size = sizeNameOf(device, widget)
  const close = () => onOpenChange(false)
  return (
    <Popover.Root open={open} onOpenChange={(o) => (setNote(null), onOpenChange(o))}>
      <Popover.Trigger asChild>
        <button type="button" className="col-tool" title="Widget menu (or right-click the title)" aria-label={`${widgetTitle(widget)} widget menu`}>
          <Ellipsis size={16} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content className="menu widget-menu" side="bottom" align="end" sideOffset={6} collisionPadding={12}>
          <button type="button" className="menu-item" onClick={onRename}>
            <Pencil size={14} aria-hidden="true" /> Rename
          </button>

          <fieldset className="menu-group">
            <legend>Colour</legend>
            <div className="swatches">
              <button type="button" className="swatch" data-swatch="none" aria-pressed={widget.colour === null} onClick={() => actions.patch({ colour: null })}>
                <span className="swatch-dot" aria-hidden="true" />
                None
              </button>
              {SWATCHES.map((s) => (
                <button key={s.key} type="button" className="swatch" data-swatch={s.key} aria-pressed={widget.colour === s.key} onClick={() => actions.patch({ colour: s.key })}>
                  <span className="swatch-dot" aria-hidden="true" />
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="menu-group">
            <legend>Icon</legend>
            <div className="icon-grid">
              <button type="button" className="icon-choice" aria-pressed={widget.icon === null} onClick={() => actions.patch({ icon: null })} aria-label="No icon">
                ∅
              </button>
              {ICONS.map((icon) => (
                <button key={icon} type="button" className="icon-choice" aria-pressed={widget.icon === icon} onClick={() => actions.patch({ icon })}>
                  {icon}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="menu-group">
            <legend>Size</legend>
            <div className="size-choices">
              {(Object.keys(SIZE_LABEL) as SizeName[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="size-choice"
                  aria-pressed={size === s}
                  onClick={() => setNote(actions.resize(s) ? null : 'No room for that size on this page.')}
                >
                  {SIZE_LABEL[s]}
                </button>
              ))}
            </div>
          </fieldset>
          {note && (
            <p className="menu-note" role="status">
              {note}
            </p>
          )}

          <button type="button" className="menu-item" onClick={() => (actions.duplicate() ? close() : setNote('This page is full. Add a page first.'))}>
            <Copy size={14} aria-hidden="true" /> Duplicate
          </button>
          <button type="button" className="menu-item menu-item-danger" onClick={() => (close(), actions.remove())}>
            <Trash2 size={14} aria-hidden="true" /> Remove
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
