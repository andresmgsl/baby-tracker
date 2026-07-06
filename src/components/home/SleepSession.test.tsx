import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createElement } from 'react'
import { DbProvider } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { getActiveTimer, listEntries, startTimer } from '../../db/queries'
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
