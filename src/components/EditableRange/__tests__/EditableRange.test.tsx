import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EditableRange from '../EditableRange'
import { validRangeValue } from '../validRangeValue'
import { useEscapeLayer } from '../../../hooks/useEscapeLayer'
import { RANGE_TRAVEL_STEPS, rangePosition } from '../../../state/rangeScale'

function Popup({ onEscape, onChange }: { onEscape: () => void; onChange: (value: number) => void }) {
  useEscapeLayer(onEscape)
  return <EditableRange value={0.5} min={0} max={1} step={0.01} ariaLabel="Mix" onChange={onChange} />
}

describe('EditableRange', () => {
  it('turns into a text field on double-click and commits on Enter', () => {
    const onChange = vi.fn()
    render(<EditableRange value={0.5} min={0} max={1} step={0.01} ariaLabel="Mix" onChange={onChange} />)
    const slider = screen.getByLabelText('Mix') as HTMLInputElement
    expect(slider.type).toBe('range')

    fireEvent.doubleClick(slider)
    const editor = screen.getByLabelText('Mix') as HTMLInputElement
    expect(editor.type).toBe('text')
    expect(editor.value).toBe('0.5')

    fireEvent.change(editor, { target: { value: '0.73' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(0.73)
    expect((screen.getByLabelText('Mix') as HTMLInputElement).type).toBe('range')
  })

  it('opens the editor with Enter on the focused slider and commits when focus leaves', () => {
    const onChange = vi.fn()
    render(<EditableRange value={2} min={0} max={10} step={1} ariaLabel="Count" onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText('Count'), { key: 'Enter' })
    const editor = screen.getByLabelText('Count') as HTMLInputElement
    expect(editor.type).toBe('text')
    // Tab moves focus on; the blur that follows is the commit.
    fireEvent.change(editor, { target: { value: '7' } })
    fireEvent.blur(editor)
    expect(onChange).toHaveBeenCalledWith(7)
    expect((screen.getByLabelText('Count') as HTMLInputElement).type).toBe('range')
  })

  it('refuses a value the slider could not reach and keeps it in the field', () => {
    const onChange = vi.fn()
    render(<EditableRange value={0.5} min={0} max={1} step={0.01} ariaLabel="Mix" onChange={onChange} />)
    fireEvent.doubleClick(screen.getByLabelText('Mix'))
    const editor = screen.getByLabelText('Mix') as HTMLInputElement
    for (const bad of ['not a number', '2', '0.735', '']) {
      fireEvent.change(editor, { target: { value: bad } })
      fireEvent.keyDown(editor, { key: 'Enter' })
      expect(editor.getAttribute('aria-invalid'), bad).toBe('true')
      expect(onChange).not.toHaveBeenCalled()
    }
    // Leaving the field with a bad value abandons the edit rather than storing it.
    fireEvent.blur(editor)
    expect(onChange).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Mix') as HTMLInputElement).type).toBe('range')
  })

  it('abandons the edit on Escape and leaves the popup around it open', () => {
    const onEscape = vi.fn()
    const onChange = vi.fn()
    render(<Popup onEscape={onEscape} onChange={onChange} />)
    fireEvent.doubleClick(screen.getByLabelText('Mix'))
    const editor = screen.getByLabelText('Mix') as HTMLInputElement
    fireEvent.change(editor, { target: { value: '0.9' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
    expect(onEscape).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Mix') as HTMLInputElement).type).toBe('range')
  })

  it('does not open the editor while disabled', () => {
    render(<EditableRange value={1} min={0} max={2} step={1} ariaLabel="Gain" onChange={() => {}} disabled />)
    fireEvent.doubleClick(screen.getByLabelText('Gain'))
    expect((screen.getByLabelText('Gain') as HTMLInputElement).type).toBe('range')
  })

  it('draws the readout beside the slider and opens the editor from it', () => {
    render(
      <EditableRange value={0.5} min={0} max={1} step={0.01} ariaLabel="Mix" onChange={() => {}}
        wrapClassName="wrap" valueClassName="readout" renderValue={(v) => `${Math.round(v * 100)}%`} />,
    )
    const readout = screen.getByText('50%')
    expect(readout.className).toBe('readout')
    expect(readout.parentElement?.className).toBe('wrap')
    fireEvent.doubleClick(readout)
    expect((screen.getByLabelText('Mix') as HTMLInputElement).type).toBe('text')
  })

  it('renders the bare input when nothing wraps it, so a grid row keeps its columns', () => {
    const { container } = render(
      <div data-testid="row">
        <span>Gain</span>
        <EditableRange value={1} min={0} max={4} step={0.1} ariaLabel="Gain" onChange={() => {}} />
        <output>1</output>
      </div>,
    )
    const row = container.querySelector('[data-testid="row"]')!
    expect(Array.from(row.children).map((child) => child.tagName)).toEqual(['SPAN', 'INPUT', 'OUTPUT'])
  })

  it('travels a log scale while reporting and taking the value in its own units', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <EditableRange value={14.4} min={0.1} max={120} step={0.1} scale="log" ariaLabel="Trail" onChange={onChange} />,
    )
    const slider = screen.getByLabelText('Trail') as HTMLInputElement
    // The input is the travel; the value is what it announces.
    expect(slider.min).toBe('0')
    expect(slider.max).toBe(String(RANGE_TRAVEL_STEPS))
    expect(slider.step).toBe('1')
    expect(Number(slider.value)).toBe(Math.round(rangePosition(14.4, 0.1, 120, 'log') * RANGE_TRAVEL_STEPS))
    expect(Number(slider.value)).toBeGreaterThan(650)
    expect(slider.getAttribute('aria-valuetext')).toBe('14.4')

    // Halfway along three decades is about 3.5 s, not 60 s.
    fireEvent.change(slider, { target: { value: String(RANGE_TRAVEL_STEPS / 2) } })
    expect(onChange).toHaveBeenLastCalledWith(3.5)
    fireEvent.change(slider, { target: { value: String(RANGE_TRAVEL_STEPS) } })
    expect(onChange).toHaveBeenLastCalledWith(120)
    fireEvent.change(slider, { target: { value: '0' } })
    expect(onChange).toHaveBeenLastCalledWith(0.1)

    // An arrow press at the bottom still moves a step.
    rerender(<EditableRange value={0.1} min={0.1} max={120} step={0.1} scale="log" ariaLabel="Trail" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Trail'), { target: { value: '1' } })
    expect(onChange).toHaveBeenLastCalledWith(0.2)

    // Typing takes seconds, on the step, as on a linear slider.
    fireEvent.doubleClick(screen.getByLabelText('Trail'))
    const editor = screen.getByLabelText('Trail') as HTMLInputElement
    expect(editor.value).toBe('0.1')
    fireEvent.change(editor, { target: { value: '17.8' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(17.8)
  })

  it('travels linearly when a log scale has no minimum above zero', () => {
    render(<EditableRange value={2} min={0} max={10} step={1} scale="log" ariaLabel="Count" onChange={() => {}} />)
    const slider = screen.getByLabelText('Count') as HTMLInputElement
    expect([slider.min, slider.max, slider.value]).toEqual(['0', '10', '2'])
    expect(slider.hasAttribute('aria-valuetext')).toBe(false)
  })

  it('accepts only values on the slider step inside its range', () => {
    expect(validRangeValue('0.3', 0, 1, 0.1)).toBe(true)
    expect(validRangeValue('0.35', 0, 1, 0.1)).toBe(false)
    expect(validRangeValue('1.1', 0, 1, 0.1)).toBe(false)
    expect(validRangeValue('-0.1', 0, 1, 0.1)).toBe(false)
    expect(validRangeValue('0.05', 0.05, 5, 0.05)).toBe(true)
  })
})
