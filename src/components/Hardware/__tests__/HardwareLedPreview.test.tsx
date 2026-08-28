import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import HardwareLedPreview from '../HardwareLedPreview'
import { usePreviewStore } from '../../../state/previewStore'
import { WS2812B_EMITTER } from '../../../state/hardware'

function publish(previewFrame: unknown, brightness = 255) {
  act(() => {
    usePreviewStore.getState().setOutputs(new Map([
      ['output', { frame: null, previewFrame }],
    ]), brightness)
  })
}

/*
 * An emitter is a group: the package and the softer surround around it, both
 * inheriting one fill so a frame costs one attribute write per LED and the two
 * can never disagree. The colour therefore lives on the group, not on the
 * shapes inside it.
 */
const emitters = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('svg > g')).map((cell) => cell.getAttribute('fill'))

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

    expect(emitters(container))
      .toEqual(['rgb(255 0 0)', 'rgb(0 255 0)', 'rgb(0 0 255)', 'rgb(12 34 56)'])
  })

  it('scales every emitter by the published master brightness', () => {
    const { container } = render(
      <HardwareLedPreview nodeId="output" cols={1} rows={1} />,
    )

    publish([[{ r: 200, g: 100, b: 50 }]], 128)

    // 200/100/50 x 128/255. Applied here rather than baked into the published
    // frame, so a source node's thumbnail dims by exactly the same value.
    expect(emitters(container)).toEqual(['rgb(100 50 25)'])
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
    expect(emitters(container)).toEqual(['rgb(10 0 0)', 'rgb(30 0 0)'])
  })

  it('lights the package where the render puts it, not the middle of the tile', () => {
    const { container } = render(
      <HardwareLedPreview
        nodeId="output"
        cols={1}
        rows={1}
        emitter={WS2812B_EMITTER}
      />,
    )

    // The 5050 sits right of centre, past the resistor, and is about a quarter
    // of the pitch wide. A centred half-tile block lights the pads instead.
    // The package is the last shape in its group; the bloom layers precede it.
    const core = container.querySelector('svg > g > rect:last-child')!
    expect(Number(core.getAttribute('width'))).toBeCloseTo(WS2812B_EMITTER.along)
    expect(Number(core.getAttribute('x')) + (WS2812B_EMITTER.along / 2))
      .toBeCloseTo(WS2812B_EMITTER.centreAlong)
    expect(Number(core.getAttribute('y')) + (WS2812B_EMITTER.across / 2))
      .toBeCloseTo(WS2812B_EMITTER.centreAcross)
  })

  it('lights a centred square when no emitter was measured for the part', () => {
    // A panel draws its own LEDs over bare board, where centred is correct.
    const { container } = render(
      <HardwareLedPreview nodeId="output" cols={1} rows={1} cellFill={0.5} />,
    )

    const core = container.querySelector('svg > g > rect:last-child')!
    expect(core.getAttribute('x')).toBe('0.25')
    expect(core.getAttribute('y')).toBe('0.25')
    expect(core.getAttribute('width')).toBe('0.5')
  })

  it('clears the LEDs when the output loses its frame route', () => {
    const { container } = render(
      <HardwareLedPreview nodeId="output" cols={1} rows={1} />,
    )

    publish([[{ r: 255, g: 20, b: 10 }]])
    expect(emitters(container)).toEqual(['rgb(255 20 10)'])

    publish(null)
    expect(emitters(container)).toEqual(['rgb(0 0 0)'])
  })
})
