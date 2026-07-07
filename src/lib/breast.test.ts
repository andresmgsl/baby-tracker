import { describe, it, expect } from 'vitest'
import { breastTotals, deriveSide } from './breast'

const base = { side: null, left_ms: 0, right_ms: 0, running_since: null } as const

describe('breastTotals', () => {
  it('is zero when idle', () => {
    expect(breastTotals(base, 5000)).toEqual({ left: 0, right: 0, total: 0 })
  })
  it('adds the running-left segment to committed left', () => {
    const t = { ...base, side: 'L' as const, left_ms: 2000, running_since: 4000 }
    expect(breastTotals(t, 9000)).toEqual({ left: 7000, right: 0, total: 7000 })
  })
  it('adds the running-right segment and keeps committed left', () => {
    const t = { ...base, side: 'R' as const, left_ms: 3000, right_ms: 1000, running_since: 4000 }
    expect(breastTotals(t, 6000)).toEqual({ left: 3000, right: 3000, total: 6000 })
  })
  it('ignores a running segment when paused (running_since null)', () => {
    const t = { ...base, left_ms: 3000, right_ms: 2000 }
    expect(breastTotals(t, 999999)).toEqual({ left: 3000, right: 2000, total: 5000 })
  })
})

describe('deriveSide', () => {
  it('is both when both sides have time', () => { expect(deriveSide(1, 1)).toBe('both') })
  it('is R when only right has time', () => { expect(deriveSide(0, 5)).toBe('R') })
  it('is L when only left has time', () => { expect(deriveSide(5, 0)).toBe('L') })
  it('defaults to L when neither has time', () => { expect(deriveSide(0, 0)).toBe('L') })
})
