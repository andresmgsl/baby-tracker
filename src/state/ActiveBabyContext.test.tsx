import { act, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DbProvider } from '../db/client'
import { makeTestApi } from '../db/testApi'
import { addBaby } from '../db/queries'
import { ActiveBabyProvider, useActiveBaby } from './ActiveBabyContext'
import { getActiveBabyId } from '../db/activeBabyRef'

function Probe() {
  const { active, babies, setActive } = useActiveBaby()
  return (
    <div>
      <span data-testid="active">{active?.name ?? 'none'}</span>
      <span data-testid="count">{babies.length}</span>
      {babies.map((b) => <button key={b.id} onClick={() => setActive(b.id)}>{b.name}</button>)}
    </div>
  )
}

test('loads babies and defaults active to the first; setActive updates ref', async () => {
  const { db, babyId } = makeTestApi() // seeds one baby named 'Baby'
  await addBaby(db, 'Second', null)
  render(<DbProvider executor={db}><ActiveBabyProvider><Probe /></ActiveBabyProvider></DbProvider>)
  await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'))
  expect(screen.getByTestId('active').textContent).toBe('Baby')
  expect(getActiveBabyId()).toBe(babyId)
  await act(async () => { screen.getByText('Second').click() })
  await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('Second'))
})
