import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import CanvasContextMenu from '../CanvasContextMenu'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'

// A SolidColor output node already on the canvas, whose `color` output we
// "drag" from. Its output dataType is what the picker filters against.
function seedSourceNode() {
  const def = NODE_LIBRARY.find((n) => n.type === 'SolidColor')!
  useGraphStore.setState({
    nodes: [{
      id: 'src', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: def.label, nodeType: 'SolidColor', category: def.category, properties: {}, inputs: def.inputs, outputs: def.outputs },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any],
    edges: [],
  })
}

function seedFftSourceNode() {
  const def = NODE_LIBRARY.find((n) => n.type === 'FFTAnalyzer')!
  useGraphStore.setState({
    nodes: [{
      id: 'fft', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: def.label, nodeType: 'FFTAnalyzer', category: def.category, properties: {}, inputs: def.inputs, outputs: def.outputs },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any],
    edges: [],
  })
}

describe('CanvasContextMenu — drag-to-empty picker', () => {
  beforeEach(() => seedSourceNode())

  it('lists only nodes with an input compatible with the dragged output type', () => {
    // Drag from a `frame` output: every listed node must accept a frame input.
    const { container } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        connectFrom={{ nodeId: 'src', handleId: 'frame', dataType: 'frame' }}
        onClose={() => {}}
      />
    )
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      const def = NODE_LIBRARY.find((n) => n.label === label)!
      expect(def.inputs.some((p) => p.dataType === 'frame')).toBe(true)
    }
    // A pure source like Time (no frame input) must be excluded.
    expect(labels).not.toContain('Time')
  })

  it('placing a node from the picker auto-wires it to the dragged output', () => {
    const target = NODE_LIBRARY.find((n) => n.inputs.some((p) => p.dataType === 'frame'))!
    const { getByText } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        connectFrom={{ nodeId: 'src', handleId: 'frame', dataType: 'frame' }}
        onClose={() => {}}
      />
    )
    fireEvent.click(getByText(target.label))

    const { nodes, edges } = useGraphStore.getState()
    expect(nodes.some((n) => n.data.nodeType === target.type)).toBe(true)
    const wired = edges.find((e) => e.source === 'src' && e.sourceHandle === 'frame')
    expect(wired).toBeTruthy()
    const firstFrameInput = target.inputs.find((p) => p.dataType === 'frame')!
    expect(wired!.targetHandle).toBe(firstFrameInput.id)
  })

  it('fans out FFT bass, mids, and treble together for Audio Flow', () => {
    seedFftSourceNode()
    const { getByText } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        connectFrom={{ nodeId: 'fft', handleId: 'bass', dataType: 'float' }}
        onClose={() => {}}
      />
    )

    fireEvent.click(getByText('Audio Flow'))

    const { edges } = useGraphStore.getState()
    expect(edges).toHaveLength(3)
    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'fft', sourceHandle: 'bass', targetHandle: 'bass' }),
      expect.objectContaining({ source: 'fft', sourceHandle: 'mids', targetHandle: 'mids' }),
      expect.objectContaining({ source: 'fft', sourceHandle: 'treble', targetHandle: 'treble' }),
    ]))
  })
})
