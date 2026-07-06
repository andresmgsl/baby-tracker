import { describe, it, expect } from 'vitest'
import { elapsedMs, formatElapsed, clampStartTs } from './timer'

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

describe('clampStartTs', () => {
  it('caps a future start at now while running', () => {
    expect(clampStartTs(5_000, 4_000, null)).toBe(4_000)
  })
  it('leaves a past start untouched while running', () => {
    expect(clampStartTs(3_000, 4_000, null)).toBe(3_000)
  })
  it('caps start at the frozen end time when stopped', () => {
    expect(clampStartTs(9_000, 10_000, 6_000)).toBe(6_000)
  })
})
