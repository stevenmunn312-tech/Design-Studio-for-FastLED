import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import LEDPreview from '../LEDPreview'
import { useUiStore } from '../../../state/uiStore'

describe('Stage controls', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0)
  })
  afterEach(() => {
    useUiStore.setState({ stageMode: false, preview3d: false })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Stage hides the menu bar, which is where the 3D toggle otherwise lives.
  it('offers the 3D toggle inside Stage', () => {
    useUiStore.setState({ stageMode: true, preview3d: false, uiEffectsEnabled: true })
    render(<LEDPreview />)
    const toggle = screen.getByRole('button', { name: 'Toggle 3D preview' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(useUiStore.getState().preview3d).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('offers Record inside Stage', () => {
    useUiStore.setState({ stageMode: true, uiEffectsEnabled: true })
    render(<LEDPreview />)
    expect(screen.getByRole('button', { name: /Record/ })).toBeTruthy()
  })

  it('keeps the 3D toggle out of the docked preview header', () => {
    useUiStore.setState({ stageMode: false })
    render(<LEDPreview />)
    expect(screen.queryByRole('button', { name: 'Toggle 3D preview' })).toBeNull()
  })
})
