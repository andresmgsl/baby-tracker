import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../../db/client'
import { makeTestExecutor } from '../../../db/testExecutor'
import { getActiveTimer } from '../../../db/queries'
import { BreastForm } from './BreastForm'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('BreastForm', () => {
  it('starts a timer on the selected side', async () => {
    render(<BreastForm onClose={() => {}} onSaved={() => {}} />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'Right' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start timer' }))
    const t = await getActiveTimer(exec)
    expect(t?.type).toBe('breast')
    expect(t?.side).toBe('R')
  })

  it('saves a manual breastfeed with duration', async () => {
    const onSaved = vi.fn()
    render(<BreastForm onClose={() => {}} onSaved={onSaved} />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'Enter manually' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSaved).toHaveBeenCalled()
  })
})
