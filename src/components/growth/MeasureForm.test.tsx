import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { listMeasurements, setSetting } from '../../db/queries'
import { MeasureForm } from './MeasureForm'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('MeasureForm', () => {
  it('stores weight in canonical grams from a kg input', async () => {
    await setSetting(exec, 'units_weight', 'kg')
    const onSaved = vi.fn()
    render(<MeasureForm onClose={() => {}} onSaved={onSaved} initialType="weight" />, { wrapper })
    const input = await screen.findByLabelText(/value/i)
    await userEvent.clear(input)
    await userEvent.type(input, '5.2')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const rows = await listMeasurements(exec, 'weight')
    expect(rows[0].value).toBe(5200)
    expect(onSaved).toHaveBeenCalled()
  })
})
