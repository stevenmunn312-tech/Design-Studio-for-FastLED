import { describe, it, expect, beforeEach, vi } from 'vitest'
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

function seedMicSourceNode() {
  const def = NODE_LIBRARY.find((n) => n.type === 'MicInput')!
  useGraphStore.setState({
    nodes: [{
      id: 'mic', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: def.label, nodeType: 'MicInput', category: def.category, properties: {}, inputs: def.inputs, outputs: def.outputs },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any],
    edges: [],
  })
}

function seedSelectedNodes() {
  const solid = NODE_LIBRARY.find((n) => n.type === 'SolidColor')!
  const output = NODE_LIBRARY.find((n) => n.type === 'MatrixOutput')!
  useGraphStore.setState({
    nodes: [
      {
        id: 'solid', type: 'studioNode', position: { x: 0, y: 0 },
        data: { label: solid.label, nodeType: solid.type, category: solid.category, properties: {}, inputs: solid.inputs, outputs: solid.outputs },
        selected: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      {
        id: 'output', type: 'studioNode', position: { x: 240, y: 0 },
        data: { label: output.label, nodeType: output.type, category: output.category, properties: {}, inputs: output.inputs, outputs: output.outputs },
        selected: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ],
    edges: [],
  })
}

function seedEmptyGraphWithClipboard() {
  const def = NODE_LIBRARY.find((n) => n.type === 'SolidColor')!
  useGraphStore.setState({
    nodes: [],
    edges: [],
    clipboard: {
      nodes: [{
        id: 'clip-solid',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: { label: def.label, nodeType: def.type, category: def.category, properties: {}, inputs: def.inputs, outputs: def.outputs },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any],
      edges: [],
    },
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
    const labels = Array.from(container.querySelectorAll('[data-suggestion-type="direct"]'))
      .map((button) => button.getAttribute('data-node-type'))
      .filter((value): value is string => !!value)
    expect(labels.length).toBeGreaterThan(0)
    for (const type of labels) {
      const def = NODE_LIBRARY.find((n) => n.type === type)!
      expect(def.inputs.some((p) => p.dataType === 'frame')).toBe(true)
    }
    // A pure source like Time (no frame input) must be excluded.
    expect(labels).not.toContain('TimeNode')
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

  it('shows brief why-this-fits guidance for ranked matches', () => {
    const { getAllByText } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        connectFrom={{ nodeId: 'src', handleId: 'frame', dataType: 'frame' }}
        onClose={() => {}}
      />
    )

    expect(getAllByText('Connects straight into its Frame input.').length).toBeGreaterThan(0)
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

  it('fans out FFT bass, mids, and treble together for Audio Hue', () => {
    seedFftSourceNode()
    const { getByText } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        connectFrom={{ nodeId: 'fft', handleId: 'treble', dataType: 'float' }}
        onClose={() => {}}
      />
    )

    fireEvent.click(getByText('Audio → Hue'))

    const { edges } = useGraphStore.getState()
    expect(edges).toHaveLength(3)
    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'fft', sourceHandle: 'bass', targetHandle: 'bass' }),
      expect.objectContaining({ source: 'fft', sourceHandle: 'mids', targetHandle: 'mids' }),
      expect.objectContaining({ source: 'fft', sourceHandle: 'treble', targetHandle: 'treble' }),
    ]))
  })

  it('keeps single-wire behavior for FFT targets without the full three-band signature', () => {
    seedFftSourceNode()
    const { getByText } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        connectFrom={{ nodeId: 'fft', handleId: 'bass', dataType: 'float' }}
        onClose={() => {}}
      />
    )

    fireEvent.click(getByText('Bass Pulse'))

    const { edges } = useGraphStore.getState()
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual(expect.objectContaining({
      source: 'fft',
      sourceHandle: 'bass',
      targetHandle: 'bass',
    }))
  })

  it('can drop a bridge chain that converts audio into color', () => {
    seedMicSourceNode()
    const { getByText } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        connectFrom={{ nodeId: 'mic', handleId: 'audio', dataType: 'audio' }}
        onClose={() => {}}
      />
    )

    fireEvent.click(getByText('Audio → color'))

    const { nodes, edges } = useGraphStore.getState()
    expect(nodes.map((node) => node.data.nodeType)).toEqual(
      expect.arrayContaining(['MicInput', 'FFTAnalyzer', 'AudioHue', 'HSVToRGB'])
    )
    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'mic', sourceHandle: 'audio', targetHandle: 'audio' }),
      expect.objectContaining({ sourceHandle: 'bass', targetHandle: 'bass' }),
      expect.objectContaining({ sourceHandle: 'mids', targetHandle: 'mids' }),
      expect.objectContaining({ sourceHandle: 'treble', targetHandle: 'treble' }),
      expect.objectContaining({ sourceHandle: 'hue', targetHandle: 'h' }),
    ]))
  })

  it('disables Delete Selected when nothing is selected', () => {
    const { getByRole } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        onClose={() => {}}
      />
    )

    expect(getByRole('button', { name: 'Delete Selected' }).hasAttribute('disabled')).toBe(true)
  })

  it('deletes the current selection from the canvas menu', () => {
    seedSelectedNodes()
    const onClose = vi.fn()
    const { getByRole } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        onClose={onClose}
      />
    )

    fireEvent.click(getByRole('button', { name: 'Delete Selected' }))

    expect(useGraphStore.getState().nodes).toHaveLength(0)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows Create Group immediately after Select All and groups the selection', () => {
    seedSelectedNodes()
    const onClose = vi.fn()
    const { getByRole, getAllByRole } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        onClose={onClose}
      />
    )

    const menuButtons = getAllByRole('button')
    const selectAllIndex = menuButtons.findIndex((button) => button.textContent === 'Select All')
    expect(menuButtons[selectAllIndex + 1].textContent).toBe('Create Group')

    fireEvent.click(getByRole('button', { name: 'Create Group' }))
    fireEvent.click(getByRole('button', { name: 'Create Group' }))

    expect(useGraphStore.getState().nodes.some((node) => node.data.nodeType === 'Group')).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps Paste enabled on an empty graph when the clipboard has nodes', () => {
    seedEmptyGraphWithClipboard()
    const { getByRole } = render(
      <CanvasContextMenu
        x={0} y={0} flowPosition={{ x: 100, y: 100 }}
        onClose={() => {}}
      />
    )

    expect(getByRole('button', { name: 'Add Node ▶' }).hasAttribute('disabled')).toBe(false)
    expect(getByRole('button', { name: 'Select All' }).hasAttribute('disabled')).toBe(true)
    expect(getByRole('button', { name: 'Create Group' }).hasAttribute('disabled')).toBe(true)
    expect(getByRole('button', { name: 'Delete Selected' }).hasAttribute('disabled')).toBe(true)
    expect(getByRole('button', { name: 'Tidy Graph' }).hasAttribute('disabled')).toBe(true)
    expect(getByRole('button', { name: 'Paste' }).hasAttribute('disabled')).toBe(false)
  })
})
