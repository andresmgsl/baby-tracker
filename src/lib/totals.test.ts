import { describe, it, expect } from 'vitest'
import { computeDailyTotals } from './totals'
import type { Entry } from '../db/types'

const base = {
  baby_id: 1, end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  diaper_kind: null, med_name: null, med_dose: null, note: null, photo_id: null,
  left_ms: null, right_ms: null, created_at: 0, updated_at: 0,
}
const entry = (id: number, type: Entry['type'], extra: Partial<Entry> = {}): Entry =>
  ({ id, type, start_ts: id * 1000, ...base, ...extra })

const HOUR = 3_600_000
const DAY = 86_400_000
// A fixed "today" window at an epoch day boundary (UTC midnight) for arithmetic clarity.
const dayStart = 1_000 * DAY // some day boundary
const dayEnd = dayStart + DAY - 1

describe('computeDailyTotals', () => {
  it('counts feeds and diapers by start_ts within the window and sums completed sleep', () => {
    const entries: Entry[] = [
      entry(1, 'breast', { start_ts: dayStart + HOUR, end_ts: dayStart + HOUR + 18 * 60_000 }),
      entry(2, 'bottle', { start_ts: dayStart + 2 * HOUR }),
      entry(3, 'solids', { start_ts: dayStart + 3 * HOUR }),
      entry(4, 'diaper', { start_ts: dayStart + HOUR, diaper_kind: 'wet' }),
      entry(5, 'diaper', { start_ts: dayStart + 2 * HOUR, diaper_kind: 'dirty' }),
      entry(6, 'sleep', { start_ts: dayStart + HOUR, end_ts: dayStart + HOUR + 50 * 60_000 }),
      entry(7, 'sleep', { start_ts: dayStart + HOUR, end_ts: null }), // in-progress, ignored
      entry(8, 'note', { start_ts: dayStart + HOUR }),
    ]
    expect(computeDailyTotals(entries, dayStart, dayEnd)).toEqual({
      feeds: 3,
      diapers: 2,
      sleepMs: 50 * 60_000,
    })
  })

  it('counts only the in-window portion of a sleep that crosses into the next day', () => {
    // Sleep 10pm today -> 3am tomorrow, relative to a day that ends at dayEnd.
    const sleepStart = dayEnd - 2 * HOUR + 1 // ~2h before midnight
    const sleepEnd = dayStart + DAY + 3 * HOUR // 3h into the next day
    const s: Entry[] = [entry(1, 'sleep', { start_ts: sleepStart, end_ts: sleepEnd })]

    // Today's window gets the ~2h before midnight.
    expect(computeDailyTotals(s, dayStart, dayEnd).sleepMs).toBe(2 * HOUR)
    // The next day's window gets the 3h after midnight.
    const nextStart = dayStart + DAY
    const nextEnd = nextStart + DAY - 1
    expect(computeDailyTotals(s, nextStart, nextEnd).sleepMs).toBe(3 * HOUR)
  })

  it('excludes a sleep entirely outside the window', () => {
    const s: Entry[] = [entry(1, 'sleep', { start_ts: dayStart - 5 * HOUR, end_ts: dayStart - 4 * HOUR })]
    expect(computeDailyTotals(s, dayStart, dayEnd).sleepMs).toBe(0)
  })

  it('handles an empty window', () => {
    expect(computeDailyTotals([], dayStart, dayEnd)).toEqual({ feeds: 0, diapers: 0, sleepMs: 0 })
  })
})
