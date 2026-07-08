import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DbProvider } from '../../db/client'
import { makeTestApi } from '../../db/testApi'
import { ActiveBabyProvider } from '../../state/ActiveBabyContext'
import { BabiesSection } from './BabiesSection'

function mount(db: any) {
  return render(<DbProvider executor={db}><ActiveBabyProvider><BabiesSection /></ActiveBabyProvider></DbProvider>)
}

test('can add a baby', async () => {
  const { db } = makeTestApi()
  mount(db)
  await waitFor(() => screen.getByText('Baby'))
  fireEvent.change(screen.getByPlaceholderText(/new baby/i), { target: { value: 'Ivy' } })
  fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
  await waitFor(() => expect(screen.getByDisplayValue('Ivy')).toBeInTheDocument())
})
