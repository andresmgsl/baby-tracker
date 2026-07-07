import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimelineFilter, filterEntries } from './TimelineFilter'
import type { Entry, EntryType } from '../../db/types'

const mk = (id: number, type: EntryType): Entry => ({
  id, baby_id: 1, type, start_ts: id, end_ts: null, side: null, amount_ml: null, milk_type: null,
  food: null, diaper_kind: null, med_name: null, med_dose: null, note: null,
  photo_id: null, left_ms: null, right_ms: null, created_at: 0, updated_at: 0,
})

describe('filterEntries', () => {
  const rows = [mk(1, 'sleep'), mk(2, 'diaper'), mk(3, 'bottle')]
  it('returns all entries when nothing selected', () => {
    expect(filterEntries(rows, new Set())).toEqual(rows)
  })
  it('keeps only selected types', () => {
    expect(filterEntries(rows, new Set<EntryType>(['diaper'])).map((e) => e.id)).toEqual([2])
  })
})

describe('TimelineFilter', () => {
  it('reflects selection with aria-pressed and toggles on click', async () => {
    const onToggle = vi.fn()
    render(<TimelineFilter selected={new Set<EntryType>(['sleep'])} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: /sleep/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /diaper/i })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: /diaper/i }))
    expect(onToggle).toHaveBeenCalledWith('diaper')
  })
})
