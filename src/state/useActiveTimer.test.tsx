import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbProvider } from '../db/client'
import { makeTestExecutor } from '../db/testExecutor'
import { startTimer, pauseTimer, startBreastSide, pauseBreastSide } from '../db/queries'
import { useActiveTimer } from './useActiveTimer'
import type { WorkerExecutor } from '../db/client'

let exec: WorkerExecutor
beforeEach(async () => {
  vi.useFakeTimers()
  const base = await makeTestExecutor()
  exec = Object.assign(base, {
    exportBytes: async () => new Uint8Array(),
    importBytes: async () => {},
  }) as WorkerExecutor
})
afterEach(() => vi.useRealTimers())

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('useActiveTimer', () => {
  it('loads the running timer and advances elapsed each second', async () => {
    vi.setSystemTime(10_000)
    // A breast timer with the left side actively running since 4_000.
    await startBreastSide(exec, 'L', 4_000)
    const { result } = renderHook(() => useActiveTimer(), { wrapper })
    // Flush the async getActiveTimer read + effects. Under fake timers,
    // waitFor() deadlocks, so drain microtasks explicitly instead.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.timer?.type).toBe('breast')
    expect(result.current.elapsed).toBe(6_000)
    // Advancing the fake clock by 1s fires one interval tick; elapsed is the
    // feed duration, so the running left side keeps accruing (now 11_000).
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.elapsed).toBe(7_000)
  })

  it('reports frozen feed duration for a breast timer with no side running', async () => {
    vi.setSystemTime(10_000)
    // Left ran 1_000→4_000 (3_000ms), then paused: no side is running now.
    await startBreastSide(exec, 'L', 1_000)
    await pauseBreastSide(exec, 4_000)
    const { result } = renderHook(() => useActiveTimer(), { wrapper })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.timer?.type).toBe('breast')
    // Feed duration = committed left_ms (3_000), NOT wall-clock (now - start).
    expect(result.current.elapsed).toBe(3_000)
    // Nothing is running, so advancing the clock must not change it.
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(result.current.elapsed).toBe(3_000)
  })

  it('reports frozen net elapsed while paused and does not tick', async () => {
    vi.setSystemTime(10_000)
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    await pauseTimer(exec, 'sleep', 4_000) // net frozen at 3_000ms
    const { result } = renderHook(() => useActiveTimer(), { wrapper })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.timer?.paused_at).toBe(4_000)
    expect(result.current.elapsed).toBe(3_000)
    // Advancing the clock must NOT change elapsed — the timer is paused.
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(result.current.elapsed).toBe(3_000)
  })

  it('reports no elapsed time when there is no active timer', async () => {
    vi.setSystemTime(10_000)
    const { result } = renderHook(() => useActiveTimer(), { wrapper })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.timer).toBeNull()
    expect(result.current.elapsed).toBe(0)
  })
})
