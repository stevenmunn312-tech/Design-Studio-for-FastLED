import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function renderWith(supportsMask: boolean, onChange = vi.fn()) {
  vi.stubGlobal('CSS', { supports: () => supportsMask })
  const { default: WifiPasswordInput } = await import('../WifiPasswordInput')
  const { container } = render(<WifiPasswordInput value="secret" onChange={onChange} />)
  return container.querySelector('input') as HTMLInputElement
}

describe('WifiPasswordInput', () => {
  // jsdom drops the non-standard masking property, so the mask itself is
  // checked in a real browser; here only the field type is.
  it('uses a plain text field so password managers do not offer to save it', async () => {
    const input = await renderWith(true)
    expect(input.type).toBe('text')
  })

  it('falls back to a password field rather than showing the secret in the clear', async () => {
    const input = await renderWith(false)
    expect(input.type).toBe('password')
  })

  it('reports the typed value', async () => {
    const onChange = vi.fn()
    const input = await renderWith(true, onChange)
    fireEvent.change(input, { target: { value: 'hunter2' } })
    expect(onChange).toHaveBeenCalledWith('hunter2')
  })
})
