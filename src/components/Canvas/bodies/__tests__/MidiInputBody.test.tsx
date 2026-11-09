import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MidiInputBody from '../MidiInputBody'
import { useMidiStore } from '../../../../state/midiStore'
import { midiReading } from '../../../../midi/midiEngine'

// jsdom has no pointer capture.
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}

// The note pad and CC slider stand in for a controller while designing: they
// play real messages on the node's channel, so the evaluator hears them as it
// would a keyboard.
describe('MidiInputBody stand-in controller', () => {
  it('plays its note while the pad is held and sets its CC from the slider', () => {
    render(<MidiInputBody note={64} cc={11} channel={5} />)
    const pad = screen.getByRole('button', { name: 'Play note 64' })

    fireEvent.pointerDown(pad, { pointerId: 1 })
    expect(midiReading(useMidiStore.getState(), 5, 64, 11).velocity).toBeCloseTo(100 / 127)
    // Another channel's node does not hear it.
    expect(midiReading(useMidiStore.getState(), 6, 64, 11).velocity).toBe(0)
    expect(pad.textContent).toBe('PLAYING')

    fireEvent.pointerUp(pad, { pointerId: 1 })
    expect(midiReading(useMidiStore.getState(), 5, 64, 11).velocity).toBe(0)

    fireEvent.change(screen.getByRole('slider', { name: 'CC 11 value' }), { target: { value: '127' } })
    expect(midiReading(useMidiStore.getState(), 5, 64, 11).cc).toBe(1)
    fireEvent.change(screen.getByRole('slider', { name: 'CC 11 value' }), { target: { value: '0' } })
  })

  it('plays on channel 1 when the node listens to every channel', () => {
    render(<MidiInputBody note={65} cc={12} channel={0} />)
    const pad = screen.getByRole('button', { name: 'Play note 65' })
    fireEvent.pointerDown(pad, { pointerId: 1 })
    expect(midiReading(useMidiStore.getState(), 1, 65, 12).velocity).toBeGreaterThan(0)
    expect(midiReading(useMidiStore.getState(), 0, 65, 12).velocity).toBeGreaterThan(0)
    fireEvent.pointerUp(pad, { pointerId: 1 })
  })
})
