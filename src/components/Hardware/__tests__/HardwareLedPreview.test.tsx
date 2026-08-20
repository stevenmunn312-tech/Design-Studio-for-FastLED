import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import HardwareLedPreview from '../HardwareLedPreview'
import { usePreviewStore } from '../../../state/previewStore'

function publish(previewFrame: unknown, brightness = 255) {
  act(() => {
    usePreviewStore.getState().setOutputs(new Map([
      ['output', { frame: null, previewFrame }],
    ]), brightness)
  })
}

describe('HardwareLedPreview', () => {
  beforeEach(() => usePreviewStore.getState().clear())

  it('paints the routed physical output frame', () => {
    const { container } = render(
      <HardwareLedPreview nodeId="output" cols={2} rows={2} />,
    )

    publish([
      [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }],
      [{ r: 0, g: 0, b: 255 }, { r: 12, g: 34, b: 56 }],
    ])

    expect(Array.from(container.querySelectorAll('rect')).map((cell) => cell.getAttribute('fill')))
      .toEqual(['rgb(255 0 0)', 'rgb(0 255 0)', 'rgb(0 0 255)', 'rgb(12 34 56)'])
  })

  it('scales every emitter by the published master brightness', () => {
    const { container } = render(
      <HardwareLedPreview nodeId="output" cols={1} rows={1} />,
    )

    publish([[{ r: 200, g: 100, b: 50 }]], 128)

    // 200/100/50 x 128/255. Applied here rather than baked into the published
    // frame, so a source node's thumbnail dims by exactly the same value.
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('rgb(100 50 25)')
  })

  it('samples a frame down when the emitter grid is coarser than it', () => {
    const { container } = render(
      <HardwareLedPreview nodeId="output" port="frame" cols={2} rows={1} />,
    )

    act(() => {
      usePreviewStore.getState().setOutputs(new Map([
        ['output', { frame: [[
          { r: 10, g: 0, b: 0 }, { r: 20, g: 0, b: 0 },
          { r: 30, g: 0, b: 0 }, { r: 40, g: 0, b: 0 },
        ]] }],
      ]), 255)
    })

    // Proportional, not a corner crop: the two emitters read columns 0 and 2.
    expect(Array.from(container.querySelectorAll('rect')).map((cell) => cell.getAttribute('fill')))
      .toEqual(['rgb(10 0 0)', 'rgb(30 0 0)'])
  })

  it('clears the LEDs when the output loses its frame route', () => {
    const { container } = render(
      <HardwareLedPreview nodeId="output" cols={1} rows={1} />,
    )

    publish([[{ r: 255, g: 20, b: 10 }]])
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('rgb(255 20 10)')

    publish(null)
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('rgb(0 0 0)')
  })
})
