import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import ShowLaneEditor from '../ShowLaneEditor'
import type { ShowFile } from '../../../types/showFile'

const show: ShowFile = {
  version: 2,
  songTitle: 'Lane',
  durationMs: 10000,
  bpm: 120,
  patternSet: ['a', 'b'],
  params: ['glow'],
  events: [
    { t: 0, cmd: 'SET_PATTERN', params: { index: 0, name: 'Pulse' } },
    { t: 0, cmd: 'TRANSITION', params: { duration: 1 } },
    { t: 4000, cmd: 'SET_PATTERN', params: { index: 1, name: 'Spark' } },
    { t: 500, cmd: 'SET_PARAM', params: { index: 0, value: 0.8 } },
    { t: 1000, cmd: 'SET_BRIGHTNESS', params: { value: 180 } },
  ],
}

const sections = [
  { startMs: 0, endMs: 4000, type: 'verse' as const, energy: 0.4 },
  { startMs: 4000, endMs: 10000, type: 'drop' as const, energy: 0.9 },
]

describe('ShowLaneEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function open(onCommit = vi.fn(), onClose = vi.fn()) {
    const opener = document.createElement('button')
    opener.textContent = 'Edit lanes'
    document.body.appendChild(opener)
    opener.focus()
    const view = render(
      <ShowLaneEditor
        show={show}
        title="Show"
        sections={sections}
        beats={[0, 500, 1000, 1500]}
        energy={[{ t: 0, overall: 0.2 }, { t: 5000, overall: 0.8 }]}
        locks={[]}
        onClose={onClose}
        onCommit={onCommit}
      />,
    )
    return { view, opener, onCommit, onClose }
  }

  it('names the dialog, keeps a lane per named input, and closes on Escape', () => {
    const { view, opener, onClose } = open()
    const dialog = view.getByRole('dialog', { name: 'Show lanes' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(view.getByText('glow')).toBeTruthy()
    expect(view.queryByText('param')).toBeNull()
    expect(view.getByRole('button', { name: 'Pattern Pulse at 0 ms' })).toBeTruthy()
    expect(view.getByRole('button', { name: 'Transition length 1000 ms' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(document.activeElement).toBe(opener)
  })

  it('locks a section, retypes it, and writes a ramp on the selected brightness event', () => {
    const { view, onCommit } = open()
    fireEvent.click(view.getByRole('button', { name: 'Lock verse' }))
    const locked = onCommit.mock.calls.at(-1)
    expect(locked?.[1]).toEqual([{ startMs: 0, endMs: 4000 }])
    expect((locked?.[0] as ShowFile).events).toHaveLength(show.events.length)

    fireEvent.change(view.getByLabelText('verse section type'), { target: { value: 'chorus' } })
    const retyped = onCommit.mock.calls.at(-1)?.[0] as ShowFile
    expect(retyped.sections?.[0].type).toBe('chorus')
    expect(view.getByRole('button', { name: 'Unlock chorus' })).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: 'Brightness at 1000 ms' }))
    fireEvent.change(view.getByLabelText('Ramp milliseconds'), { target: { value: '250' } })
    const ramped = onCommit.mock.calls.at(-1)?.[0] as ShowFile
    expect(ramped.events.find((event) => event.cmd === 'SET_BRIGHTNESS')?.params.rampMs).toBe(250)
  })

  it('drags a brightness event when snap is off and nudges it from the keyboard', () => {
    const { view, onCommit } = open()
    fireEvent.change(view.getByLabelText('Snap'), { target: { value: 'none' } })
    const marker = view.getByRole('button', { name: 'Brightness at 1000 ms' })
    const point = (type: string, target: EventTarget, clientX: number) => {
      target.dispatchEvent(new PointerEvent(type, { clientX, bubbles: true, cancelable: true }))
    }
    act(() => {
      point('pointerdown', marker, 100)
      point('pointermove', window, 172)
      point('pointerup', window, 172)
    })
    const dragged = onCommit.mock.calls.at(-1)?.[0] as ShowFile
    expect(dragged.events.find((event) => event.cmd === 'SET_BRIGHTNESS')?.t).toBe(2000)

    const moved = view.getByRole('button', { name: 'Brightness at 2000 ms' })
    // The click that ends a drag is not a selection toggle; the moved event stays selected.
    fireEvent.click(moved)
    expect(moved.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'ArrowRight' })
    const nudged = onCommit.mock.calls.at(-1)?.[0] as ShowFile
    expect(nudged.events.find((event) => event.cmd === 'SET_BRIGHTNESS')?.t).toBe(2010)
  })

  it('zooms the visible window so the scroll range opens', () => {
    const { view } = open()
    const scroll = view.getByLabelText('Timeline scroll') as HTMLInputElement
    expect(scroll.max).toBe('0')
    fireEvent.click(view.getByRole('button', { name: 'Zoom in' }))
    expect(Number(scroll.max)).toBeGreaterThan(0)
  })

  it('leaves keys typed into its fields to those fields', () => {
    const { view, onCommit } = open()
    fireEvent.click(view.getByRole('button', { name: 'Brightness at 1000 ms' }))
    const ramp = view.getByLabelText('Ramp milliseconds')
    const before = onCommit.mock.calls.length
    // Backspace edits the number; it used to delete the selected event.
    fireEvent.keyDown(ramp, { key: 'Backspace' })
    // Arrows on the scroll slider scroll; they used to nudge the selection.
    fireEvent.keyDown(view.getByLabelText('Timeline scroll'), { key: 'ArrowRight' })
    expect(onCommit.mock.calls.length).toBe(before)
    expect(view.getByRole('button', { name: 'Brightness at 1000 ms' })).toBeTruthy()
  })

  it('edits the selected value in the inspector as one undo step', () => {
    const { view, onCommit } = open()
    fireEvent.click(view.getByRole('button', { name: 'Brightness at 1000 ms' }))
    const slider = view.getByRole('slider', { name: /^Brightness/ }) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '90' } })
    fireEvent.change(slider, { target: { value: '60' } })
    const edited = onCommit.mock.calls.at(-1)?.[0] as ShowFile
    expect(edited.events.find((event) => event.cmd === 'SET_BRIGHTNESS')?.params.value).toBe(60)

    fireEvent.click(view.getByRole('button', { name: 'Undo' }))
    const undone = onCommit.mock.calls.at(-1)?.[0] as ShowFile
    expect(undone.events.find((event) => event.cmd === 'SET_BRIGHTNESS')?.params.value).toBe(180)
  })

  it('adds an event on the value in force when a lane is double-clicked', () => {
    const { view, onCommit } = open()
    fireEvent.change(view.getByLabelText('Snap'), { target: { value: 'none' } })
    const lane = view.getByText('Brightness').closest('div')!
    const track = lane.querySelector('div')!
    fireEvent.doubleClick(track, { clientX: 360 })
    const added = onCommit.mock.calls.at(-1)?.[0] as ShowFile
    const brightness = added.events.filter((event) => event.cmd === 'SET_BRIGHTNESS')
    expect(brightness).toHaveLength(2)
    expect(brightness[1]).toEqual({ t: 5000, cmd: 'SET_BRIGHTNESS', params: { value: 180 } })
    expect(view.getByRole('button', { name: 'Brightness at 5000 ms' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('draws a sequence with numbered steps and no beat lanes or snap', () => {
    const view = render(
      <ShowLaneEditor
        show={show}
        title="Sequence"
        sections={[]}
        beats={[]}
        locks={[]}
        kind="sequence"
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />,
    )
    expect(view.queryByText('Beat flash')).toBeNull()
    expect(view.queryByText('Particles')).toBeNull()
    expect(view.queryByLabelText('Snap')).toBeNull()
    expect(view.getByText('1 · Pulse')).toBeTruthy()
    expect(view.getByText('2 · Spark')).toBeTruthy()
  })

  it('plays from Space and shows the song position', () => {
    const onTogglePlay = vi.fn()
    const view = render(
      <ShowLaneEditor
        show={show}
        title="Show"
        sections={sections}
        beats={[]}
        locks={[]}
        positionMs={2500}
        onTogglePlay={onTogglePlay}
        onClose={vi.fn()}
        onCommit={vi.fn()}
      />,
    )
    expect(view.getByText('0:02.5 / 0:10.0')).toBeTruthy()
    fireEvent.keyDown(view.getByRole('dialog'), { key: ' ' })
    expect(onTogglePlay).toHaveBeenCalledTimes(1)
  })
})
