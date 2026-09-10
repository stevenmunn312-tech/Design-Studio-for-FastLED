import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HardwarePartsShelf, { type HardwareShelfCategory } from '../HardwarePartsShelf'
import { useUiStore } from '../../../state/uiStore'

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
  beforeEach(() => {
    useUiStore.getState().setHardwareShelfCategory(null)
  })

  /*
   * Which category is open is remembered across visits rather than reset on
   * every mount: the shelf unmounts on each trip to another workspace, and
   * re-finding your section every time is a tax that adds up. A blank sketch
   * is the one moment that state means nothing, so it closes them all.
   */
  it('opens nothing until a category is chosen, and remembers the choice', () => {
    const first = render(
      <HardwarePartsShelf categories={categories} targetNodeType={null} onTargetHandled={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Add Button' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Inputs/ }))
    expect(screen.getByRole('button', { name: 'Add Button' })).toBeTruthy()
    expect(useUiStore.getState().hardwareShelfCategory).toBe('inputs')

    // Leaving for another workspace and coming back keeps the section open.
    first.unmount()
    render(<HardwarePartsShelf categories={categories} targetNodeType={null} onTargetHandled={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Add Button' })).toBeTruthy()
  })

  it('browses parts by section and search', () => {
    useUiStore.getState().setHardwareShelfCategory('inputs')
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
