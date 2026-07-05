import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { insertEntry } from '../../db/queries'
import { History } from './History'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

const mk = (over = {}) => ({
  type: 'breast' as const, start_ts: Date.now(), end_ts: null, side: 'L' as const,
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null, ...over,
})

describe('History', () => {
  it('lists all entries and filters by type', async () => {
    await insertEntry(exec, mk())
    await insertEntry(exec, mk({ type: 'diaper', side: null, diaper_kind: 'wet' }))
    render(<History onEdit={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/Breast/)).toBeInTheDocument())
    expect(screen.getByText(/Diaper/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/filter/i), 'diaper')
    await waitFor(() => expect(screen.queryByText(/Breast/)).not.toBeInTheDocument())
    expect(screen.getByText(/Diaper/)).toBeInTheDocument()
  })
})
