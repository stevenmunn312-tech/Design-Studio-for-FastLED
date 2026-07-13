import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import NodeContextMenu from '../NodeContextMenu'
import { useGraphStore } from '../../../state/graphStore'
import { useNodePresets } from '../../../state/nodePresets'
import { usePatternLibrary } from '../../../state/patternLibrary'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'

function seedSelectedNodes() {
  const solid = NODE_LIBRARY.find((n) => n.type === 'SolidColor')!
  const output = NODE_LIBRARY.find((n) => n.type === 'MatrixOutput')!
  useGraphStore.setState({
    nodes: [
      {
        id: 'solid',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: {
          label: solid.label,
          nodeType: solid.type,
          category: solid.category,
          properties: {},
          inputs: solid.inputs,
          outputs: solid.outputs,
        },
        selected: true,
      },
      {
        id: 'output',
        type: 'studioNode',
        position: { x: 240, y: 0 },
        data: {
          label: output.label,
          nodeType: output.type,
          category: output.category,
          properties: {},
          inputs: output.inputs,
          outputs: output.outputs,
        },
        selected: true,
      },
    ],
    edges: [],
    selectedNodeId: 'solid',
  })
}

describe('NodeContextMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    useNodePresets.setState({ presets: [] })
    usePatternLibrary.setState({ patterns: [] })
    seedSelectedNodes()
  })

  it('renders for a selected node without triggering a render loop', () => {
    const { getByText } = render(
      <NodeContextMenu
        nodeId="solid"
        x={120}
        y={140}
        onClose={() => {}}
      />
    )

    expect(getByText('Copy')).toBeTruthy()
    expect(getByText('Duplicate')).toBeTruthy()
    expect(getByText('Disconnect All')).toBeTruthy()
    expect(getByText('Group 2 Nodes…')).toBeTruthy()
    expect(getByText('Delete')).toBeTruthy()
  })

  it('loads a saved node preset from the menu', () => {
    useNodePresets.getState().savePreset('SolidColor', 'Hot pink', { r: 255, g: 0, b: 180 })
    const { getByText } = render(
      <NodeContextMenu
        nodeId="solid"
        x={120}
        y={140}
        onClose={() => {}}
      />
    )

    expect(getByText('Save Preset…')).toBeTruthy()
    expect(getByText('Randomize Look')).toBeTruthy()
    expect(getByText('Mutate')).toBeTruthy()
    expect(getByText('Reset')).toBeTruthy()
    fireEvent.click(getByText('Hot pink'))

    expect(useGraphStore.getState().nodes[0].data.properties).toEqual({ r: 255, g: 0, b: 180 })
  })
})
