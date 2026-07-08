import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type Api } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { insertEntry } from '../../db/queries'
import { History } from './History'

let exec: Api
beforeEach(() => { exec = makeTestApi().db })
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

const mk = (over = {}) => ({
  type: 'breast' as const, start_ts: Date.now(), end_ts: null, side: 'L' as const,
  amount_ml: null, milk_type: null, food: null, diaper_kind: null,
  med_name: null, med_dose: null, note: null, photo_id: null, ...over,
})

describe('History', () => {
  it('lists all entries and filters by type via icon chips', async () => {
    await insertEntry(exec, mk())
    await insertEntry(exec, mk({ type: 'diaper', side: null, diaper_kind: 'wet' }))
    render(<History onEdit={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/Nursing/)).toBeInTheDocument())
    expect(screen.getByText(/Diaper/)).toBeInTheDocument()

    // Selecting the diaper chip narrows the list to diaper entries.
    await userEvent.click(screen.getByRole('button', { name: 'diaper' }))
    await waitFor(() => expect(screen.queryByText(/Nursing/)).not.toBeInTheDocument())
    expect(screen.getByText(/Diaper/)).toBeInTheDocument()

    // Chips are multi-select: adding breast shows both types again.
    await userEvent.click(screen.getByRole('button', { name: 'breast' }))
    await waitFor(() => expect(screen.getByText(/Nursing/)).toBeInTheDocument())
    expect(screen.getByText(/Diaper/)).toBeInTheDocument()

    // Deselecting a chip removes it from the filter.
    await userEvent.click(screen.getByRole('button', { name: 'diaper' }))
    await waitFor(() => expect(screen.queryByText(/Diaper/)).not.toBeInTheDocument())
    expect(screen.getByText(/Nursing/)).toBeInTheDocument()
  })

  it('shows a filter-specific empty message when nothing matches', async () => {
    await insertEntry(exec, mk())
    render(<History onEdit={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/Nursing/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'diaper' }))
    await waitFor(() => expect(screen.getByText(/no entries match/i)).toBeInTheDocument())
  })
})
