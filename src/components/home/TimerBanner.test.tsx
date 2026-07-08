import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TimerBanner } from './TimerBanner'
import type { ActiveTimer } from '../../db/types'

const breast = (over: Partial<ActiveTimer> = {}): ActiveTimer => ({
  type: 'breast', start_ts: 0, side: 'L', paused_ms: 0, paused_at: null,
  left_ms: 0, right_ms: 0, running_since: 0, ...over,
})

describe('TimerBanner', () => {
  it('shows the running side for an active breast timer', () => {
    render(<TimerBanner timer={breast({ side: 'L' })} elapsed={60_000} onStop={() => {}} />)
    expect(screen.getByText(/Nursing · L/)).toBeTruthy()
  })

  it('does not render "null" when a breast timer is paused (no side running)', () => {
    render(<TimerBanner timer={breast({ side: null, running_since: null })} elapsed={60_000} onStop={() => {}} />)
    expect(screen.queryByText(/null/)).toBeNull()
    expect(screen.getByText(/Nursing/)).toBeTruthy()
  })
})
