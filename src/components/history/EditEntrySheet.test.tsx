import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type Api } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { insertEntry, listEntries } from '../../db/queries'
import { EditEntrySheet } from './EditEntrySheet'
import type { Entry } from '../../db/types'

let exec: Api
beforeEach(() => { exec = makeTestApi().db })
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('EditEntrySheet — meds', () => {
  it('edits the med name and dose and persists them', async () => {
    const id = await insertEntry(exec, {
      type: 'meds', start_ts: Date.now(), end_ts: null, side: null, amount_ml: null,
      milk_type: null, food: null, diaper_kind: null, med_name: 'Vitamin D',
      med_dose: '1 drop', note: null, photo_id: null,
    })
    const rows = await listEntries(exec, { type: 'meds' })
    const entry = rows.find((r) => r.id === id) as Entry

    render(<EditEntrySheet entry={entry} onClose={() => {}} onChanged={() => {}} />, { wrapper })

    const dose = await screen.findByPlaceholderText(/dose/i)
    await userEvent.clear(dose)
    await userEvent.type(dose, '2 drops')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const after = await listEntries(exec, { type: 'meds' })
    const updated = after.find((r) => r.id === id) as Entry
    expect(updated.med_dose).toBe('2 drops')
    expect(updated.med_name).toBe('Vitamin D')
  })
})
