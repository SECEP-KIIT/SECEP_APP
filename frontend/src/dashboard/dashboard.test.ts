// Task 8a: breakpoints, grid geometry, layout edits, page keys, and GET/PUT /layouts against the real mock.
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { layoutOptions, putLayout, queryClient } from '../api/queries'
import type { Layout, LayoutPage, Widget } from '../api/types'
import { filterQuery, NO_FILTERS, parseColumnQuery } from '../inbox/cardModel'
import { deviceClassOf } from '../lib/breakpoints'
import { control } from '../mocks/control'
import { handlers } from '../mocks/handlers'
import { filterError } from '../mocks/routes/emails'
import { signIn } from '../mocks/session'
import { STARTERS, starterLayout } from '../mocks/starters'
import { db, initStore } from '../mocks/store/db'
import { firstFit, freeSlots, ghostSlots, overlaps, phoneRowsFor } from './grid'
import {
  addPage,
  addWidget,
  applyGrid,
  BUILT_TYPES,
  COLUMN_PRESETS,
  fullViewHref,
  MAX_PAGES,
  movePage,
  moveToSlot,
  removePage,
  resizeWidget,
} from './layoutModel'
import { pageKeyAction } from './pageKeys'

describe('the one breakpoint constant', () => {
  it('phone ≤ 640, tablet 641–1023, desktop ≥ 1024', () => {
    expect(deviceClassOf(360)).toBe('phone')
    expect(deviceClassOf(640)).toBe('phone')
    expect(deviceClassOf(641)).toBe('tablet')
    expect(deviceClassOf(1023)).toBe('tablet')
    expect(deviceClassOf(1024)).toBe('desktop')
  })

  it('no stylesheet has its own width media query (they select on html[data-device])', () => {
    const css = import.meta.glob<string>('../**/*.css', { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(css).length).toBeGreaterThan(3)
    for (const [p, text] of Object.entries(css)) expect(text, p).not.toMatch(/@media[^{]*(max|min)-width/)
  })
})

const widget = (patch: Partial<Widget>): Widget => ({
  id: crypto.randomUUID(), type: 'inbox_column', x: 0, y: 0, w: 1, h: 1, title: null, colour: null, icon: null, filter: '', sort: null, density: null, ...patch,
})
const pageOf = (widgets: Widget[]): LayoutPage => ({ id: crypto.randomUUID(), name: 'P', order: 0, widgets })

describe('grid geometry', () => {
  it('first fit scans rows, then columns; phone pages are a fixed 2 × 4', () => {
    expect(firstFit([], { w: 4, h: 12 }, 'desktop')).toEqual({ x: 0, y: 0 })
    expect(firstFit([{ x: 0, y: 0, w: 4, h: 12 }], { w: 4, h: 12 }, 'desktop')).toEqual({ x: 4, y: 0 })
    const full = [{ x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 2, w: 2, h: 2 }]
    expect(firstFit(full, { w: 1, h: 1 }, 'phone')).toBeNull()
    expect(freeSlots([{ x: 0, y: 0, w: 2, h: 2 }])).toHaveLength(4)
  })

  it('phone ghost slots (8b): sized to the picked widget, never overlapping each other or other widgets', () => {
    const big = { id: 'a', x: 0, y: 0, w: 2, h: 2 }
    const small = { id: 'b', x: 0, y: 2, w: 1, h: 1 }
    const ghosts = ghostSlots([big, small], small)
    expect(ghosts).toEqual([{ x: 1, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 3 }])
    // A tall widget: candidates at y = 1 and y = 2 would overlap each other, so only one survives per column.
    const tall = { id: 'c', x: 0, y: 0, w: 1, h: 2 }
    const g = ghostSlots([tall], tall).map((p) => ({ ...p, w: 1, h: 2 }))
    for (const [i, a] of g.entries()) for (const b of g.slice(i + 1)) expect(overlaps(a, b)).toBe(false)
    expect(g.some((p) => p.x === 0 && p.y === 0)).toBe(false) // where it already is
    expect(ghostSlots([big, { id: 'd', x: 0, y: 2, w: 2, h: 2 }], big)).toEqual([]) // nowhere to go
  })

  it('short phone screens show 3 rows instead of cramming 4 (360 × 480)', () => {
    // 360 × 480: 480 minus the topbar (56), tab bar (~58), padding (16), page bar (28 + 8) and dots (24 + 8) ≈ 282.
    expect(phoneRowsFor(282, 12, 110)).toBe(3)
    // 360 × 740 ≈ 542: four rows of about 126 px.
    expect(phoneRowsFor(542, 12, 110)).toBe(4)
  })
})

describe('layout edits', () => {
  it('pages: at most 9, at least 1, reorderable', () => {
    let pages: LayoutPage[] = [pageOf([])]
    for (let i = 1; i < MAX_PAGES; i++) pages = addPage(pages)!
    expect(pages).toHaveLength(MAX_PAGES)
    expect(addPage(pages)).toBeNull()
    const one = [pageOf([])]
    expect(removePage(one, one[0].id)).toBe(one)
    const two = addPage(one)!
    const moved = movePage(two, two[1].id, -1)
    expect(moved.find((p) => p.id === two[1].id)!.order).toBe(0)
  })

  it('a full phone page refuses a new widget; resize moves or refuses', () => {
    const a = widget({ x: 0, y: 0, w: 2, h: 2 })
    const b = widget({ x: 0, y: 2, w: 2, h: 1 })
    const page = pageOf([a, b])
    expect(addWidget(page, COLUMN_PRESETS[0], 'phone', 'large')).toBeNull()
    expect(addWidget(page, COLUMN_PRESETS[0], 'phone', 'medium')!.widgets.at(-1)).toMatchObject({ x: 0, y: 3, w: 2, h: 1 })
    expect(resizeWidget(page, b.id, 'large', 'phone')).toMatchObject({ widgets: [a, { id: b.id, x: 0, y: 2, w: 2, h: 2 }] })
    expect(resizeWidget(pageOf([a, b, widget({ x: 0, y: 3, w: 2, h: 1 })]), b.id, 'large', 'phone')).toBeNull()
    expect(moveToSlot(page, b.id, { x: 0, y: 0 })).toBeNull() // overlaps a
    expect(moveToSlot(page, b.id, { x: 0, y: 3 })!.widgets[1]).toMatchObject({ x: 0, y: 3 })
  })

  it('applyGrid keeps the same page object when nothing moved (no save on mount)', () => {
    const w = widget({ x: 0, y: 0, w: 4, h: 12 })
    const page = pageOf([w])
    expect(applyGrid(page, [{ i: w.id, x: 0, y: 0, w: 4, h: 12 }])).toBe(page)
    expect(applyGrid(page, [{ i: w.id, x: 4, y: 0, w: 4, h: 12 }]).widgets[0].x).toBe(4)
  })

  it('a column filter is the GET /emails vocabulary, both ways; ⤢ links with it', () => {
    const filters = { ...NO_FILTERS, view: ['due_today' as const], urgency: ['Critical' as const, 'High' as const], sender: 'contoso-client.example' }
    expect(filterQuery(filters)).toBe('view=due_today&urgency=Critical,High&sender=contoso-client.example')
    expect(parseColumnQuery(filterQuery(filters)).filters).toEqual(filters)
    expect(fullViewHref({ filter: 'view=overdue', sort: 'urgency' })).toBe('/inbox?view=overdue&sort=urgency')
    for (const p of COLUMN_PRESETS) expect(filterError(p.filter), p.key).toBeNull()
  })
})

describe('page keys (FR-UI-007)', () => {
  const key = (k: string, extra: object = {}) => ({ key: k, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, target: null, ...extra })
  it('Ctrl+←/→ and Ctrl+1…9; never while typing or inside a dialog', () => {
    expect(pageKeyAction(key('ArrowRight'), 3)).toEqual({ by: 1 })
    expect(pageKeyAction(key('2'), 3)).toEqual({ to: 1 })
    expect(pageKeyAction(key('5'), 3)).toBeNull()
    expect(pageKeyAction(key('ArrowLeft', { ctrlKey: false }), 3)).toBeNull()
    expect(pageKeyAction(key('ArrowLeft', { target: { tagName: 'INPUT' } }), 3)).toBeNull()
    expect(pageKeyAction(key('ArrowLeft', { target: { tagName: 'DIV', closest: () => ({}) } }), 3)).toBeNull()
  })
})

// ── GET / PUT /layouts/:deviceClass against the mock ─────────────────────────────────────────────────────────

vi.stubGlobal('location', new URL('http://localhost/'))
const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  initStore({ persistEnabled: false })
  control.latency = [0, 0]
  signIn(db.users[0].id)
  queryClient.clear()
})

const get = (dc: string) => queryClient.fetchQuery({ ...layoutOptions(dc as 'desktop'), staleTime: 0 })
const fails = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (err) {
    return err as ApiError
  }
  throw new Error('expected a failure')
}

describe('layouts API (proposals §13)', () => {
  it('nothing saved: 200 with the starter pages, is_default true; only built widget types', async () => {
    for (const dc of ['desktop', 'tablet', 'phone'] as const) {
      const layout = await get(dc)
      expect(layout).toMatchObject({ device_class: dc, updated_at: null, is_default: true })
      expect(layout.pages.map((p) => p.name)).toEqual(STARTERS.map((s) => s.name))
      for (const w of layout.pages.flatMap((p) => p.widgets)) {
        expect(BUILT_TYPES).toContain(w.type)
        expect(filterError(w.filter!)).toBeNull()
      }
    }
    expect((await get('desktop')).pages[0].widgets.map((w) => w.title)).toEqual(['Critical + High', 'Due today', 'Overdue'])
    expect((await get('desktop')).pages[1].widgets.map((w) => [w.title, w.sort])).toContainEqual(['Needs review', 'confidence'])
    // Tablet uses the 12-column grid, not phone slots.
    expect((await get('tablet')).pages[0].widgets[0]).toMatchObject({ w: 6, h: 12 })
    expect((await get('phone')).pages[0].widgets[0]).toMatchObject({ w: 2, h: 2 })
  })

  it('PUT is a full replace with an updated_at check; a stale save gets 409', async () => {
    const start = await get('desktop')
    const pages = [{ ...start.pages[0], name: 'Mine' }]
    const saved = await putLayout('desktop', { pages, base_updated_at: null })
    expect(saved).toMatchObject({ is_default: false, pages: [{ name: 'Mine' }], updated_at: expect.any(String) })
    expect(await get('desktop')).toEqual(saved)
    // Another window still on the starter version:
    expect(await fails(putLayout('desktop', { pages, base_updated_at: null }))).toMatchObject({ status: 409, code: 'conflict' })
    const next = await putLayout('desktop', { pages, base_updated_at: saved.updated_at })
    expect(Date.parse(next.updated_at!)).toBeGreaterThan(Date.parse(saved.updated_at!))
    // Device classes are separate.
    expect((await get('phone')).is_default).toBe(true)
  })

  it('422 for an unknown widget type, a bad filter, a non-emoji icon, phone overlap and the caps; 400 for a bad device', async () => {
    const start: Layout = await get('desktop')
    const w = start.pages[0].widgets[0]
    const put = (widgets: Partial<Widget>[], dc: 'desktop' | 'phone' = 'desktop') =>
      fails(putLayout(dc, { pages: [{ ...start.pages[0], widgets: widgets.map((x) => ({ ...w, id: crypto.randomUUID(), ...x })) as Widget[] }], base_updated_at: null }))
    const field = async (p: Promise<ApiError>) => Object.keys(((await p).details as { fields: Record<string, string> }).fields)
    expect(await field(put([{ type: 'kanban' as never }]))).toContain('pages.0.widgets.0.type')
    expect(await field(put([{ filter: 'type=Spam' }]))).toEqual(['pages.0.widgets.0.filter'])
    expect(await field(put([{ filter: 'sort=urgency' }]))).toEqual(['pages.0.widgets.0.filter'])
    expect(await field(put([{ icon: 'ab' }]))).toEqual(['pages.0.widgets.0.icon'])
    expect(await field(put([{ colour: '#ff0000' as never }]))).toEqual(['pages.0.widgets.0.colour'])
    expect((await put([{ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 1, h: 1 }], 'phone')).status).toBe(422)
    expect((await put(Array.from({ length: 25 }, (_, i) => ({ y: i * 12 })))).status).toBe(422)
    const tooMany = Array.from({ length: 10 }, (_, order) => ({ id: crypto.randomUUID(), name: `P${order}`, order: order % 9, widgets: [] }))
    expect((await fails(putLayout('desktop', { pages: tooMany, base_updated_at: null }))).status).toBe(422)
    expect((await fails(queryClient.fetchQuery({ ...layoutOptions('watch' as never), retry: false }))).status).toBe(400)
  })

  it('the starter layout is the same on every GET (stable ids)', () => {
    expect(starterLayout('desktop')).toEqual(starterLayout('desktop'))
  })
})
