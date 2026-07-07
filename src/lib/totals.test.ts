import { describe, it, expect } from 'vitest'
import { computeDailyTotals } from './totals'
import type { Entry } from '../db/types'

const base = {
  end_ts: null, side: null, amount_ml: null, milk_type: null, food: null,
  diaper_kind: null, med_name: null, med_dose: null, note: null, photo_id: null,
  left_ms: null, right_ms: null, created_at: 0, updated_at: 0,
}
const entry = (id: number, type: Entry['type'], extra: Partial<Entry> = {}): Entry =>
  ({ id, type, start_ts: id * 1000, ...base, ...extra })

describe('computeDailyTotals', () => {
  it('counts feeds and diapers and sums completed sleep', () => {
    const entries: Entry[] = [
      entry(1, 'breast', { end_ts: 1000 + 18 * 60_000 }),
      entry(2, 'bottle'),
      entry(3, 'solids'),
      entry(4, 'diaper', { diaper_kind: 'wet' }),
      entry(5, 'diaper', { diaper_kind: 'dirty' }),
      entry(6, 'sleep', { start_ts: 0, end_ts: 50 * 60_000 }),
      entry(7, 'sleep', { start_ts: 0, end_ts: null }), // in-progress, ignored
      entry(8, 'note'),
    ]
    expect(computeDailyTotals(entries)).toEqual({
      feeds: 3,
      diapers: 2,
      sleepMs: 50 * 60_000,
    })
  })

  it('handles an empty day', () => {
    expect(computeDailyTotals([])).toEqual({ feeds: 0, diapers: 0, sleepMs: 0 })
  })
})
