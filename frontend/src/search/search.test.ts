import { describe, expect, it } from 'vitest'
import { filterCount, highlight, NO_FILTERS, searchQueries } from './searchQuery'

describe('search palette', () => {
  it('searches subjects first, the text on Go deeper, and includes handled mail', () => {
    const [open, handled] = searchQueries('budget q3', NO_FILTERS, false)
    expect(new URL(open, 'http://x').searchParams.get('q_in')).toBe('subject')
    expect(new URL(open, 'http://x').searchParams.get('q')).toBe('budget q3')
    expect(new URL(handled, 'http://x').searchParams.get('view')).toBe('handled')
    expect(new URL(searchQueries('budget', NO_FILTERS, true)[0], 'http://x').searchParams.get('q_in')).toBe('all')
  })

  it('maps filters to GET /emails parameters; status filters drop the handled query', () => {
    const f = { type: ['Task' as const], urgency: ['Critical' as const, 'High' as const], view: ['unread' as const], includeHandled: true }
    const paths = searchQueries('', f, false)
    expect(paths).toHaveLength(1)
    const p = new URL(paths[0], 'http://x').searchParams
    expect([p.get('type'), p.get('urgency'), p.get('view'), p.get('q')]).toEqual(['Task', 'Critical,High', 'unread', null])
    expect(filterCount(f)).toBe(4)
    expect(searchQueries('x', { ...NO_FILTERS, includeHandled: false }, false)).toHaveLength(1)
  })

  it('highlights every query word, case-insensitive, as plain-text pieces', () => {
    expect(highlight('Q3 Budget review', 'budget q3')).toEqual([
      { text: 'Q3', hit: true },
      { text: ' ', hit: false },
      { text: 'Budget', hit: true },
      { text: ' review', hit: false },
    ])
    expect(highlight('<b>x</b>', 'x').map((p) => p.text).join('')).toBe('<b>x</b>')
  })
})
