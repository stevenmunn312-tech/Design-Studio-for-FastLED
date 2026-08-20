import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import HardwareLedPreview from '../HardwareLedPreview'
import { usePreviewStore } from '../../../state/previewStore'

function publish(previewFrame: unknown) {
  act(() => {
    usePreviewStore.getState().setOutputs(new Map([
      ['output', { frame: null, previewFrame }],
    ]))
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
