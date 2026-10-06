import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ClampedNumberInput from '../ClampedNumberInput'
import { useEscapeLayer } from '../../../hooks/useEscapeLayer'

// The board menu or custom board editor the field sits in.
function Menu({ onEscape, onCommit }: { onEscape: () => void; onCommit: (value: number) => void }) {
  useEscapeLayer(onEscape)
  return <ClampedNumberInput value={5} min={1} max={24} ariaLabel="Volts" onCommit={onCommit} />
}

describe('ClampedNumberInput', () => {
  it('abandons an edit on Escape and leaves the menu around it open', () => {
    const onEscape = vi.fn()
    const onCommit = vi.fn()
    render(<Menu onEscape={onEscape} onCommit={onCommit} />)
    const field = screen.getByLabelText('Volts') as HTMLInputElement
    field.focus()
    fireEvent.change(field, { target: { value: '0' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(field.value).toBe('5')
    expect(onCommit).not.toHaveBeenCalled()
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('passes Escape on to the menu when there is no edit to abandon', () => {
    const onEscape = vi.fn()
    render(<Menu onEscape={onEscape} onCommit={() => {}} />)
    const field = screen.getByLabelText('Volts')
    field.focus()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })
})
