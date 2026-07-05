import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { getSetting } from '../../db/queries'
import { UnitsSection } from './UnitsSection'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('UnitsSection', () => {
  it('persists a unit change', async () => {
    render(<UnitsSection />, { wrapper })
    await waitFor(() => expect(screen.getByLabelText('Weight')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Weight'), 'lb')
    await waitFor(async () => expect(await getSetting(exec, 'units_weight')).toBe('lb'))
  })
})
