import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HardwarePartsShelf, { type HardwareShelfCategory } from '../HardwarePartsShelf'

const categories: HardwareShelfCategory[] = [
  {
    id: 'inputs',
    label: 'Inputs',
    hint: 'Controls and sensors',
    items: [{
      key: 'button',
      nodeType: 'ButtonInput',
      label: 'Button',
      hint: 'A momentary control',
      disabled: false,
      disabledReason: null,
      visual: 'button',
      onSelect: vi.fn(),
    }],
  },
  {
    id: 'displays',
    label: 'Displays',
    hint: 'Screens and readouts',
    items: [{
      key: 'transport',
      nodeType: 'TransportDisplay',
      label: 'Transport display',
      hint: 'A colour now-playing screen',
      disabled: false,
      disabledReason: null,
      renderSrc: '/parts/transport.webp',
      onSelect: vi.fn(),
    }],
  },
]

describe('HardwarePartsShelf', () => {
  it('browses parts by section and search', () => {
    render(<HardwarePartsShelf categories={categories} targetNodeType={null} onTargetHandled={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Add Button' })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find part' }), {
      target: { value: 'now-playing' },
    })
    expect(screen.getByRole('button', { name: 'Add Transport display' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add Button' })).toBeNull()
  })

  it('opens and focuses a part requested by Graph search', () => {
    const handled = vi.fn()
    render(
      <HardwarePartsShelf
        categories={categories}
        targetNodeType="TransportDisplay"
        onTargetHandled={handled}
      />,
    )

    const part = screen.getByRole('button', { name: 'Add Transport display' })
    expect(document.activeElement).toBe(part)
    expect(handled).toHaveBeenCalled()
  })
})
