import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { BottomTabs } from './BottomTabs'

describe('BottomTabs', () => {
  it('marks the active tab and reports changes', async () => {
    const onChange = vi.fn()
    render(<BottomTabs active="home" onChange={onChange} />)
    expect(screen.getByRole('button', { name: /home/i })).toHaveClass('active')
    await userEvent.click(screen.getByRole('button', { name: /growth/i }))
    expect(onChange).toHaveBeenCalledWith('growth')
  })
})
