import { describe, it, expect } from 'vitest'
import { formatClock, formatDuration, formatAgo, ageLabel, startOfDay, endOfDay } from './time'

const at = (h: number, m: number) => new Date(2026, 5, 25, h, m, 0, 0).getTime()

describe('formatClock', () => {
  it('formats 24h local time', () => {
    expect(formatClock(at(14, 5))).toBe('14:05')
    expect(formatClock(at(9, 0))).toBe('09:00')
  })
})

describe('formatDuration', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(18 * 60_000)).toBe('18 min')
    expect(formatDuration(72 * 60_000)).toBe('1h 12m')
    expect(formatDuration(0)).toBe('0s')
  })
})

describe('formatAgo', () => {
  it('formats elapsed time with a floor of "just now"', () => {
    const now = at(14, 20)
    expect(formatAgo(now - 30_000, now)).toBe('just now')
    expect(formatAgo(now - 135 * 60_000, now)).toBe('2h 15m ago')
    expect(formatAgo(now - 5 * 60_000, now)).toBe('5m ago')
  })
})

describe('ageLabel', () => {
  it('chooses days, weeks, months, or years', () => {
    const now = at(12, 0)
    expect(ageLabel(now - 6 * 86_400_000, now)).toBe('6 d')
    expect(ageLabel(now - 21 * 86_400_000, now)).toBe('3 wk')
    expect(ageLabel(now - 130 * 86_400_000, now)).toBe('4 mo')
    expect(ageLabel(now - 800 * 86_400_000, now)).toBe('2 y')
  })
})

describe('day boundaries', () => {
  it('computes local start and end of day', () => {
    const ts = at(14, 5)
    expect(startOfDay(ts)).toBe(new Date(2026, 5, 25, 0, 0, 0, 0).getTime())
    expect(endOfDay(ts)).toBe(new Date(2026, 5, 25, 23, 59, 59, 999).getTime())
  })
})
