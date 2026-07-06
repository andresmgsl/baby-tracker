import { describe, it, expect } from 'vitest'
import { dayGroups } from './dayGroups'
import type { Entry } from '../../db/types'
import { startOfDay } from '../../lib/time'

const DAY = 86_400_000
const base: Omit<Entry, 'id' | 'start_ts'> = {
  type: 'note', end_ts: null, side: null, amount_ml: null, milk_type: null,
  food: null, diaper_kind: null, med_name: null, med_dose: null, note: 'x',
  photo_id: null, created_at: 0, updated_at: 0,
}
const entry = (id: number, start_ts: number): Entry => ({ ...base, id, start_ts })

describe('dayGroups', () => {
  const now = new Date('2026-07-07T12:00:00').getTime()

  it('groups entries by calendar day, newest day first', () => {
    const groups = dayGroups([
      entry(1, now),                    // today
      entry(2, now - DAY),              // yesterday
      entry(3, now - DAY - 3600_000),   // yesterday, earlier
      entry(4, now - 2 * DAY),          // two days ago
    ], now)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', expect.stringMatching(/Jul/)])
    expect(groups[1].entries.map((e) => e.id)).toEqual([2, 3])
  })

  it('keys each group by start-of-day', () => {
    const groups = dayGroups([entry(1, now)], now)
    expect(groups[0].key).toBe(String(startOfDay(now)))
  })

  it('returns empty array for no entries', () => {
    expect(dayGroups([], now)).toEqual([])
  })
})
