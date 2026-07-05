import { describe, it, expect } from 'vitest'
import { elapsedMs, formatElapsed } from './timer'

describe('timer', () => {
  it('computes elapsed time, never negative', () => {
    expect(elapsedMs(1000, 5000)).toBe(4000)
    expect(elapsedMs(5000, 1000)).toBe(0)
  })
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatElapsed(4 * 60_000 + 12_000)).toBe('04:12')
    expect(formatElapsed(3_600_000 + 4 * 60_000 + 12_000)).toBe('1:04:12')
  })
})
