import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbProvider } from '../db/client'
import { makeTestExecutor } from '../db/testExecutor'
import { startTimer } from '../db/queries'
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
    await startTimer(exec, { type: 'breast', start_ts: 4_000, side: 'L' })
    const { result } = renderHook(() => useActiveTimer(), { wrapper })
    // Flush the async getActiveTimer read + effects. Under fake timers,
    // waitFor() deadlocks, so drain microtasks explicitly instead.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.timer?.type).toBe('breast')
    expect(result.current.elapsed).toBe(6_000)
    // Advancing the fake clock by 1s fires one interval tick; elapsed is
    // recomputed from start_ts against the now-advanced Date.now() (11_000).
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.elapsed).toBe(7_000)
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
