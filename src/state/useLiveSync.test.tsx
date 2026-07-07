import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbProvider } from '../db/client'
import { makeTestApi } from '../db/testApi'
import { insertEntry, startTimer } from '../db/queries'
import { useLiveSync } from './useLiveSync'
import type { Api } from '../db/client'

let exec: Api
beforeEach(() => {
  vi.useFakeTimers()
  exec = makeTestApi().db
})
afterEach(() => vi.useRealTimers())

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

describe('useLiveSync', () => {
  it('does not fire on the baseline poll', async () => {
    const onChange = vi.fn()
    renderHook(() => useLiveSync(onChange, 3000), { wrapper })
    await settle()
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve() })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fires when the change marker advances', async () => {
    const onChange = vi.fn()
    renderHook(() => useLiveSync(onChange, 3000), { wrapper })
    await settle()
    await insertEntry(exec, {
      type: 'diaper', start_ts: 1_000, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'wet', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); await Promise.resolve() })
    expect(onChange).toHaveBeenCalled()
  })

  it('fires when the active timer signature changes', async () => {
    const onChange = vi.fn()
    renderHook(() => useLiveSync(onChange, 3000), { wrapper })
    await settle()
    await startTimer(exec, { type: 'sleep', start_ts: 1000, side: null })
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); await Promise.resolve() })
    expect(onChange).toHaveBeenCalled()
  })
})
