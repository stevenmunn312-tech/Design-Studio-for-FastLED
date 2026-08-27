import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import TransportDisplayNodeBody from '../TransportDisplayNodeBody'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { ROOT_GRAPH_ID, useGraphStore, type StudioNode } from '../../../state/graphStore'
import { usePreviewStore } from '../../../state/previewStore'

function display(properties: Record<string, unknown>): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === 'TransportDisplay')!
  return {
    id: 'tft', type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType: def.type, category: def.category,
      properties, inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

describe('TransportDisplayNodeBody', () => {
  beforeEach(() => {
    usePreviewStore.getState().clear()
  })

  it('keeps the exact mounted panel aspect ratio before the first preview frame', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '90' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    const canvas = screen.getByRole('img', { name: 'Transport display preview, 320 by 240 pixels' })
    expect(canvas.getAttribute('width')).toBe('320')
    expect(canvas.getAttribute('height')).toBe('240')
  })

  it('uses the square module native ratio at rotation zero', () => {
    useGraphStore.setState({
      nodes: [display({ partId: 'st7789-tft-240x240', tftRotation: '0' })],
      edges: [], activeGraphId: ROOT_GRAPH_ID,
    } as never)
    render(<TransportDisplayNodeBody nodeId="tft" />)
    expect(screen.getByRole('img', { name: 'Transport display preview, 240 by 240 pixels' })).toBeTruthy()
  })
})
