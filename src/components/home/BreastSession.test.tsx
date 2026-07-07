import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createElement } from 'react'
import { DbProvider } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { getActiveTimer, listEntries } from '../../db/queries'
import { BreastSession } from './BreastSession'
import type { Api } from '../../db/client'

let exec: Api
beforeEach(() => { exec = makeTestApi().db })
afterEach(() => vi.restoreAllMocks())

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const renderPage = (props: Partial<Parameters<typeof BreastSession>[0]> = {}) =>
  render(createElement(DbProvider, { executor: exec, children:
    createElement(BreastSession, {
      syncSignal: 0, onClose: () => {}, onCommitted: () => {}, ...props,
    }) }))

describe('BreastSession', () => {
  it('tapping L starts the left timer', async () => {
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Left breast' }))
    await flush()
    const t = await getActiveTimer(exec)
    expect(t?.type).toBe('breast')
    expect(t?.side).toBe('L')
  })

  it('Save writes a breast entry with per-side durations and clears the timer', async () => {
    const onCommitted = vi.fn()
    renderPage({ onCommitted })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Left breast' }))
    await flush()
    expect((await getActiveTimer(exec))?.side).toBe('L')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(onCommitted).toHaveBeenCalled()
    const entries = await listEntries(exec, { type: 'breast' })
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('breast')
    expect(entries[0].left_ms).toBeGreaterThanOrEqual(0)
    expect(entries[0].right_ms).toBe(0)
    expect(await getActiveTimer(exec)).toBeNull()
  })

  it('tapping L twice pauses the side but keeps the session running', async () => {
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Left breast' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Left breast' }))
    await flush()
    const t = await getActiveTimer(exec)
    expect(t).not.toBeNull()
    expect(t?.side).toBeNull()
    expect(t?.left_ms).toBeGreaterThanOrEqual(0)
  })

  it('saves a manual entry without a running timer', async () => {
    const onCommitted = vi.fn()
    renderPage({ onCommitted })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'ENTER TIME MANUALLY' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    expect(onCommitted).toHaveBeenCalled()
    const entries = await listEntries(exec, { type: 'breast' })
    expect(entries).toHaveLength(1)
    expect(entries[0].left_ms).toBe(10 * 60_000)
    expect(entries[0].right_ms).toBe(0)
  })

  it('discards the session on cancel confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Left breast' }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await flush()
    expect(await getActiveTimer(exec)).toBeNull()
    expect(await listEntries(exec, { type: 'breast' })).toHaveLength(0)
  })
})
