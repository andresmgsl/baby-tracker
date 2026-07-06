import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type WorkerExecutor } from '../../db/client'
import { makeTestExecutor } from '../../db/testExecutor'
import { insertEntry } from '../../db/queries'
import { Home } from './Home'

let exec: WorkerExecutor
beforeEach(async () => {
  const base = await makeTestExecutor()
  exec = Object.assign(base, { exportBytes: async () => new Uint8Array(), importBytes: async () => {} }) as WorkerExecutor
})
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('Home', () => {
  it('renders today totals and the timeline from the database', async () => {
    await insertEntry(exec, {
      type: 'bottle', start_ts: Date.now(), end_ts: null, side: null, amount_ml: 90,
      milk_type: 'formula', food: null, diaper_kind: null, med_name: null,
      med_dose: null, note: null, photo_id: null,
    })
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/90ml · formula/)).toBeInTheDocument())
    expect(screen.getByText('1')).toBeInTheDocument() // 1 feed total
  })
})
