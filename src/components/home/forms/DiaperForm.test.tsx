import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type Api } from '../../../db/client'
import { makeTestApi } from '../../../db/testApi'
import { listEntries } from '../../../db/queries'
import { DiaperForm } from './DiaperForm'

let exec: Api
beforeEach(() => { exec = makeTestApi().db })
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(DbProvider, { executor: exec, children })

describe('DiaperForm', () => {
  it('saves a diaper entry with the chosen kind', async () => {
    const onSaved = vi.fn()
    render(<DiaperForm onClose={() => {}} onSaved={onSaved} />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'dirty' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const rows = await listEntries(exec, { type: 'diaper' })
    expect(rows).toHaveLength(1)
    expect(rows[0].diaper_kind).toBe('dirty')
    expect(onSaved).toHaveBeenCalled()
  })
})
