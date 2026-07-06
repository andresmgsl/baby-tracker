import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstallBanner } from './InstallBanner'

vi.mock('../../lib/pwaInstall', () => ({
  usePwaInstall: () => ({
    canInstall: true,
    isIOS: false,
    isInstalled: false,
    promptInstall: vi.fn(),
  }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('InstallBanner', () => {
  it('does not throw when localStorage.getItem is unavailable', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => render(<InstallBanner />)).not.toThrow()
    expect(screen.getByText(/Install BabyLog/)).toBeInTheDocument()
  })

  it('hides the banner when dismissed', () => {
    render(<InstallBanner />)
    expect(screen.getByText(/Install BabyLog/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Dismiss'))

    expect(screen.queryByText(/Install BabyLog/)).not.toBeInTheDocument()
  })
})
