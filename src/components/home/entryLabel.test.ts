import { describe, it, expect } from 'vitest'
import { entryLabel } from './entryLabel'

const base = {
  id: 1, baby_id: 1, start_ts: 0, end_ts: null, side: null, amount_ml: null, milk_type: null,
  food: null, diaper_kind: null, med_name: null, med_dose: null, note: null,
  photo_id: null, left_ms: null, right_ms: null, created_at: 0, updated_at: 0,
}

describe('entryLabel', () => {
  it('summarizes each entry type', () => {
    expect(entryLabel({ ...base, type: 'breast', side: 'L', end_ts: 18 * 60_000 }))
      .toEqual({ icon: '🤱', text: 'Breast · L · 18 min' })
    expect(entryLabel({ ...base, type: 'bottle', amount_ml: 90, milk_type: 'formula' }))
      .toEqual({ icon: '🍼', text: 'Bottle · 90ml · formula' })
    expect(entryLabel({ ...base, type: 'diaper', diaper_kind: 'dirty' }))
      .toEqual({ icon: '💩', text: 'Diaper · dirty' })
    expect(entryLabel({ ...base, type: 'sleep', end_ts: 50 * 60_000 }))
      .toEqual({ icon: '😴', text: 'Sleep · 50 min' })
  })

  it('breast shows both sides when both have time', () => {
    const e = { ...base, type: 'breast' as const, side: 'both' as const, end_ts: 480_000,
      left_ms: 300_000, right_ms: 180_000 }
    expect(entryLabel(e)).toEqual({ icon: '🤱', text: 'Breast · L 5 min / R 3 min' })
  })

  it('breast shows a single side when only one has time', () => {
    const e = { ...base, type: 'breast' as const, side: 'L' as const, end_ts: 300_000,
      left_ms: 300_000, right_ms: 0 }
    expect(entryLabel(e)).toEqual({ icon: '🤱', text: 'Breast · L · 5 min' })
  })

  it('breast falls back to side + duration for legacy rows without per-side data', () => {
    const e = { ...base, type: 'breast' as const, side: 'both' as const, end_ts: 480_000,
      left_ms: null, right_ms: null }
    expect(entryLabel(e)).toEqual({ icon: '🤱', text: 'Breast · both · 8 min' })
  })
})
