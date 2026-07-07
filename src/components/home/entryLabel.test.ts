import { describe, it, expect } from 'vitest'
import { entryLabel } from './entryLabel'

const base = {
  id: 1, start_ts: 0, end_ts: null, side: null, amount_ml: null, milk_type: null,
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
})
