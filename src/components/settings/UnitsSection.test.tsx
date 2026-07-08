import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { DbProvider, type Api } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { getSetting } from '../../db/queries'
import { UnitsSection } from './UnitsSection'

let exec: Api
beforeEach(() => { exec = makeTestApi().db })
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
