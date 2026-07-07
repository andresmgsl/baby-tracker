import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onSeeAll={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/90ml · formula/)).toBeInTheDocument())
    expect(screen.getByText('1')).toBeInTheDocument() // 1 feed total
  })

  it('shows older-day entries but counts totals for today only', async () => {
    const now = Date.now()
    const DAY = 86_400_000
    await insertEntry(exec, {
      type: 'diaper', start_ts: now, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'wet', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    await insertEntry(exec, {
      type: 'diaper', start_ts: now - DAY, end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: 'dirty', med_name: null, med_dose: null,
      note: null, photo_id: null,
    })
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onSeeAll={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText('Yesterday')).toBeInTheDocument())
    // both diaper rows visible (today wet + yesterday dirty)
    expect(screen.getByText(/Diaper · wet/)).toBeInTheDocument()
    expect(screen.getByText(/Diaper · dirty/)).toBeInTheDocument()
    // totals count today only: 1 nappy, not 2
    expect(screen.getByText('nappies').previousElementSibling).toHaveTextContent('1')
  })

  it('See all fires onSeeAll', async () => {
    const onSeeAll = vi.fn()
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onSeeAll={onSeeAll} />, { wrapper })
    await userEvent.click(await screen.findByRole('button', { name: /see all/i }))
    expect(onSeeAll).toHaveBeenCalled()
  })
})
