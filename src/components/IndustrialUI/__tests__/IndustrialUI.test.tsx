import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JackSocket, RackButton, RotaryKnob, ToggleSwitch } from '../IndustrialUI'

describe('Industrial UI controls', () => {
  it('exposes pressed state on rack buttons', () => {
    render(<RackButton active>Stage</RackButton>)
    expect(screen.getByRole('button', { name: 'Stage' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('reports rotary knob changes as numbers', () => {
    const onChange = vi.fn()
    render(<RotaryKnob label="Speed" value={0.15} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), { target: { value: '0.24' } })
    expect(onChange).toHaveBeenCalledWith(0.24)
  })

  it('toggles switches through their controlled callback', () => {
    const onChange = vi.fn()
    render(<ToggleSwitch label="Overlay" checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Overlay' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('describes jack connection state', () => {
    const onClick = vi.fn()
    render(<JackSocket label="Frame out" connected accent="blue" onClick={onClick} />)
    const jack = screen.getByRole('button', { name: 'Frame out connected' })
    expect(jack.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(jack)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
