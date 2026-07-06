import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createElement } from 'react'
import { DbProvider } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { getActiveTimer, listEntries, startTimer, pauseTimer } from '../../db/queries'
import { SleepSession } from './SleepSession'
import type { WorkerExecutor } from '../../db/client'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, {
    exportBytes: async () => new Uint8Array(),
    importBytes: async () => {},
  }) as WorkerExecutor
})
afterEach(() => vi.restoreAllMocks())

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const renderPage = (props: Partial<Parameters<typeof SleepSession>[0]> = {}) =>
  render(createElement(DbProvider, { executor: exec, children:
    createElement(SleepSession, {
      syncSignal: 0, onClose: () => {}, onCommitted: () => {}, ...props,
    }) }))

describe('SleepSession', () => {
  it('starts a timer from the pre-start view', async () => {
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    await flush()
    expect(await getActiveTimer(exec)).not.toBeNull()
    expect(screen.getByText(/duration/i)).toBeTruthy()
  })

  it('saves a running sleep as an entry and clears the timer', async () => {
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    const onCommitted = vi.fn()
    renderPage({ onCommitted })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await flush()
    const entries = await listEntries(exec, { type: 'sleep' })
    expect(entries).toHaveLength(1)
    expect(entries[0].start_ts).toBe(1_000)
    expect(await getActiveTimer(exec)).toBeNull()
    expect(onCommitted).toHaveBeenCalled()
  })

  it('STOP pauses the timer and the button becomes RESUME', async () => {
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }))
    await flush()
    expect((await getActiveTimer(exec))?.paused_at).not.toBeNull()
    expect(screen.getByRole('button', { name: /^resume$/i })).toBeTruthy()
  })

  it('RESUME clears the pause', async () => {
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    await pauseTimer(exec, 'sleep', 5_000)
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^resume$/i }))
    await flush()
    expect((await getActiveTimer(exec))?.paused_at).toBeNull()
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeTruthy()
  })

  it('saves net duration, excluding the paused gap', async () => {
    // start 1000, paused at 5000 with 0 prior pause → net 4000 → end_ts 5000
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    await pauseTimer(exec, 'sleep', 5_000)
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await flush()
    const [entry] = await listEntries(exec, { type: 'sleep' })
    expect(entry.start_ts).toBe(1_000)
    expect(entry.end_ts).toBe(5_000)
  })

  it('discards the session on cancel confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await startTimer(exec, { type: 'sleep', start_ts: 1_000, side: null })
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await flush()
    expect(await getActiveTimer(exec)).toBeNull()
    expect(await listEntries(exec, { type: 'sleep' })).toHaveLength(0)
  })
})
