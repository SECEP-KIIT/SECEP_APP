import { describe, expect, it } from 'vitest'
import { isSnoozed, snoozeChoices, splitSnoozed } from './snooze'

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)

describe('snoozeChoices', () => {
  it('offers later today (3 h, on the half hour), tomorrow 9 am and next Monday 9 am', () => {
    const now = local(2026, 11, 19, 10, 10) // Thursday
    const [later, tomorrow, week] = snoozeChoices(now)
    expect(later.at).toEqual(local(2026, 11, 19, 13, 30))
    expect(tomorrow.at).toEqual(local(2026, 11, 20, 9))
    expect(week.at).toEqual(local(2026, 11, 23, 9))
  })
  it('drops "later today" when it would be tomorrow', () => {
    expect(snoozeChoices(local(2026, 11, 19, 22, 0)).map((c) => c.id)).toEqual(['tomorrow', 'week'])
  })
  it('next week is always the following Monday, even on a Monday or Sunday', () => {
    expect(snoozeChoices(local(2026, 11, 23, 8)).at(-1)!.at).toEqual(local(2026, 11, 30, 9))
    expect(snoozeChoices(local(2026, 11, 22, 8)).at(-1)!.at).toEqual(local(2026, 11, 23, 9))
  })
})

describe('splitSnoozed', () => {
  const now = local(2026, 11, 19, 12)
  const items = [
    { id: 1, snoozed_until: null, handled: false },
    { id: 2, snoozed_until: local(2026, 11, 19, 15).toISOString(), handled: false },
    { id: 3, snoozed_until: local(2026, 11, 19, 9).toISOString(), handled: false },
    { id: 4, snoozed_until: local(2026, 11, 19, 15).toISOString(), handled: true },
  ]
  it('puts future snoozes last and keeps order; a past snooze counts as back', () => {
    const { active, snoozed } = splitSnoozed(items, now)
    expect(active.map((i) => i.id)).toEqual([1, 3, 4]) // 4 is handled: done, not snoozed
    expect(snoozed.map((i) => i.id)).toEqual([2])
    expect(isSnoozed(items[2], now)).toBe(false)
  })
})
