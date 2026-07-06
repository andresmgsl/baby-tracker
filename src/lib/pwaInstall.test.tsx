import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePwaInstall } from './pwaInstall'

afterEach(() => vi.restoreAllMocks())

function fireBeforeInstall() {
  const evt: any = new Event('beforeinstallprompt')
  evt.prompt = vi.fn().mockResolvedValue(undefined)
  evt.userChoice = Promise.resolve({ outcome: 'accepted' })
  act(() => { window.dispatchEvent(evt) })
  return evt
}

describe('usePwaInstall', () => {
  it('becomes installable after beforeinstallprompt and calls prompt', async () => {
    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.canInstall).toBe(false)
    const evt = fireBeforeInstall()
    expect(result.current.canInstall).toBe(true)
    await act(async () => { await result.current.promptInstall() })
    expect(evt.prompt).toHaveBeenCalled()
  })

  it('clears installability after appinstalled', () => {
    const { result } = renderHook(() => usePwaInstall())
    fireBeforeInstall()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(result.current.canInstall).toBe(false)
    expect(result.current.isInstalled).toBe(true)
  })
})
