import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DbProvider } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { addBaby } from '../../db/queries'
import { ActiveBabyProvider, useActiveBaby } from '../../state/ActiveBabyContext'
import { BabySwitcher } from './BabySwitcher'

function Wrap() {
  const { active } = useActiveBaby()
  return <><span data-testid="active">{active?.name}</span>
    <BabySwitcher open onClose={() => {}} onManage={() => {}} /></>
}

test('tapping a baby switches the active baby', async () => {
  const { db } = makeTestApi()
  await addBaby(db, 'Zoe', null)
  render(<DbProvider executor={db}><ActiveBabyProvider><Wrap /></ActiveBabyProvider></DbProvider>)
  await waitFor(() => screen.getByText('Zoe'))
  fireEvent.click(screen.getByText('Zoe'))
  await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('Zoe'))
})
