import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ROOT_GRAPH_ID, useGraphStore } from '../../../state/graphStore'
import StereoVuMeterNodeBody from '../StereoVuMeterNodeBody'

describe('StereoVuMeterNodeBody', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'out-a', type: 'studioNode', position: { x: 0, y: 0 },
          data: {
            label: 'Main Matrix', nodeType: 'MatrixOutput', category: 'output',
            properties: { form: 'matrix' }, inputs: [], outputs: [],
          },
        },
        {
          id: 'vu', type: 'studioNode', position: { x: 0, y: 0 },
          data: {
            label: 'Stereo VU Meter', nodeType: 'StereoVuMeter', category: 'output',
            properties: { targetOutputId: '', visualizationMode: 'Classic Ladder' },
            inputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }], outputs: [],
          },
        },
      ] as never,
      edges: [],
      activeGraphId: ROOT_GRAPH_ID,
      graphData: {},
    })
  })

  it('selects a root LED output or standalone placement', () => {
    render(<StereoVuMeterNodeBody nodeId="vu" />)
    const select = screen.getByLabelText('Stereo VU Meter target LED output') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'Standalone', 'Main Matrix',
    ])

    fireEvent.change(select, { target: { value: 'out-a' } })
    expect(useGraphStore.getState().nodes.find((node) => node.id === 'vu')?.data.properties.targetOutputId)
      .toBe('out-a')
  })
})
