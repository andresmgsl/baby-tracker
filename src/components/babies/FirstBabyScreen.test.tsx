import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DbProvider } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { archiveBaby } from '../../db/queries'
import { ActiveBabyProvider, useActiveBaby } from '../../state/ActiveBabyContext'
import { FirstBabyScreen } from './FirstBabyScreen'

function Harness() {
  const { active, loading } = useActiveBaby()
  if (loading) return <span>loading</span>
  return active ? <span data-testid="has">{active.name}</span> : <FirstBabyScreen />
}

test('adding the first baby dismisses the gate', async () => {
  const { db, babyId } = makeTestApi()
  await archiveBaby(db, babyId) // now the family has zero non-archived babies
  render(<DbProvider executor={db}><ActiveBabyProvider><Harness /></ActiveBabyProvider></DbProvider>)
  await waitFor(() => expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument())
  fireEvent.change(screen.getByPlaceholderText(/name/i), { target: { value: 'Nova' } })
  fireEvent.click(screen.getByRole('button', { name: /add baby/i }))
  await waitFor(() => expect(screen.getByTestId('has').textContent).toBe('Nova'))
})
