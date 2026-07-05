import { describe, it, expect } from 'vitest'
import { exportFilename } from './backup'

describe('exportFilename', () => {
  it('formats the date into the filename', () => {
    const ts = new Date(2026, 5, 25, 14, 0, 0).getTime()
    expect(exportFilename(ts)).toBe('babytracker-2026-06-25.db')
  })
})
