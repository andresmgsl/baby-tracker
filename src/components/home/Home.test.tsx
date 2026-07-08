import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type Api } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { insertEntry, startBreastSide } from '../../db/queries'
import { Home } from './Home'

let exec: Api
beforeEach(() => { exec = makeTestApi().db })
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('Home', () => {
  it('renders today totals and the timeline from the database', async () => {
    await insertEntry(exec, {
      type: 'bottle', start_ts: Date.now(), end_ts: null, side: null, amount_ml: 90,
      milk_type: 'formula', food: null, diaper_kind: null, med_name: null,
      med_dose: null, note: null, photo_id: null,
    })
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onOpenBreast={() => {}} onSeeAll={() => {}} />, { wrapper })
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
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onOpenBreast={() => {}} onSeeAll={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText('Yesterday')).toBeInTheDocument())
    // both diaper rows visible (today wet + yesterday dirty)
    expect(screen.getByText(/Diaper · wet/)).toBeInTheDocument()
    expect(screen.getByText(/Diaper · dirty/)).toBeInTheDocument()
    // totals count today only: 1 nappy, not 2
    expect(screen.getByText('nappies').previousElementSibling).toHaveTextContent('1')
  })

  it('See all fires onSeeAll', async () => {
    const onSeeAll = vi.fn()
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onOpenBreast={() => {}} onSeeAll={onSeeAll} />, { wrapper })
    await userEvent.click(await screen.findByRole('button', { name: /see all/i }))
    expect(onSeeAll).toHaveBeenCalled()
  })

  it('distinguishes an empty filter from an empty window', async () => {
    await insertEntry(exec, {
      type: 'bottle', start_ts: Date.now(), end_ts: null, side: null, amount_ml: 90,
      milk_type: 'formula', food: null, diaper_kind: null, med_name: null,
      med_dose: null, note: null, photo_id: null,
    })
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onOpenBreast={() => {}} onSeeAll={() => {}} />, { wrapper })
    // filter to a type with no entries -> filter-specific message, not the window message
    await userEvent.click(await screen.findByRole('button', { name: 'diaper' }))
    expect(await screen.findByText('No entries match this filter.')).toBeInTheDocument()
    expect(screen.queryByText('No entries in the last 3 days.')).not.toBeInTheDocument()
  })

  it('tapping the Breast quick-log button opens the breast page', async () => {
    const onOpenBreast = vi.fn()
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onOpenBreast={onOpenBreast} onSeeAll={() => {}} />, { wrapper })
    await userEvent.click(await screen.findByText('Nursing'))
    expect(onOpenBreast).toHaveBeenCalled()
  })

  it('tapping a running breast timer banner opens the breast page (does not stop it)', async () => {
    const onOpenBreast = vi.fn()
    await startBreastSide(exec, 'L', Date.now())
    render(<Home onLog={() => {}} onSelectEntry={() => {}} onOpenSleep={() => {}} onOpenBreast={onOpenBreast} onSeeAll={() => {}} />, { wrapper })
    await userEvent.click(await screen.findByRole('button', { name: /tap to open/i }))
    expect(onOpenBreast).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /tap to open/i })).toBeInTheDocument()
  })
})
