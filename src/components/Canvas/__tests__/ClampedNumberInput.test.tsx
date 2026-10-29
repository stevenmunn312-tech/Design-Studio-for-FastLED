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

  // ShowLaneEditor snapshots history on every commit, so a value committed
  // again on Enter and again on the blur Enter causes made one edit cost
  // three Ctrl+Z presses.
  it('commits an in-range edit once when Enter confirms it', () => {
    const onCommit = vi.fn()
    render(<ClampedNumberInput value={5} min={1} max={24} ariaLabel="Volts" onCommit={onCommit} />)
    const field = screen.getByLabelText('Volts') as HTMLInputElement
    field.focus()
    fireEvent.change(field, { target: { value: '7' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenLastCalledWith(7)
    expect(field.value).toBe('5')
  })

  it('commits an out-of-range edit once, clamped, when it is confirmed', () => {
    const onCommit = vi.fn()
    render(<ClampedNumberInput value={5} min={1} max={24} ariaLabel="Volts" onCommit={onCommit} />)
    const field = screen.getByLabelText('Volts') as HTMLInputElement
    field.focus()
    fireEvent.change(field, { target: { value: '40' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenLastCalledWith(24)
  })

  it('snaps a committed value to the step without rejecting the digits typed on the way', () => {
    const onCommit = vi.fn()
    render(<ClampedNumberInput value={500} min={100} max={100000} step={100} ariaLabel="Milliamps" onCommit={onCommit} />)
    const field = screen.getByLabelText('Milliamps') as HTMLInputElement
    field.focus()
    fireEvent.change(field, { target: { value: '1' } })
    fireEvent.change(field, { target: { value: '15' } })
    fireEvent.change(field, { target: { value: '150' } })
    expect(field.value).toBe('150')
    expect(onCommit).not.toHaveBeenCalledWith(150)
    fireEvent.change(field, { target: { value: '1500' } })
    expect(onCommit).toHaveBeenLastCalledWith(1500)
    fireEvent.change(field, { target: { value: '150' } })
    fireEvent.blur(field)
    expect(onCommit).toHaveBeenLastCalledWith(200)
    expect(onCommit).not.toHaveBeenCalledWith(150)
  })

  it('never commits a fraction into a whole-number field', () => {
    const onCommit = vi.fn()
    render(<ClampedNumberInput value={1} min={0} max={16} step={1} ariaLabel="Universe" onCommit={onCommit} />)
    const field = screen.getByLabelText('Universe') as HTMLInputElement
    field.focus()
    fireEvent.change(field, { target: { value: '1.5' } })
    fireEvent.blur(field)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenLastCalledWith(2)
  })

  it('keeps a decimal step exact', () => {
    const onCommit = vi.fn()
    render(<ClampedNumberInput value={0} min={0} max={1} step={0.1} ariaLabel="Ratio" onCommit={onCommit} />)
    const field = screen.getByLabelText('Ratio') as HTMLInputElement
    field.focus()
    fireEvent.change(field, { target: { value: '0.34' } })
    fireEvent.blur(field)
    expect(onCommit).toHaveBeenLastCalledWith(0.3)
  })
})
