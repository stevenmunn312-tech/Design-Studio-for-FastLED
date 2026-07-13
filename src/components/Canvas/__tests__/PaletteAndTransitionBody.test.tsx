import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { CustomPaletteEditorBody } from '../PaletteEditorBody'
import { TransitionBody } from '../TransitionPickerBody'

function nodeData(type: string, properties: Record<string, unknown>) {
  const def = NODE_LIBRARY.find((n) => n.type === type)!
  return {
    label: def.label,
    nodeType: def.type,
    category: def.category,
    properties,
    inputs: def.inputs,
    outputs: def.outputs,
  }
}

function installCanvasMock() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
}

describe('palette and transition node bodies', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    installCanvasMock()
    useGraphStore.setState({
      nodes: [],
      edges: [],
      graphs: { root: { id: 'root', name: 'Main' } },
      graphData: {},
      activeGraphId: 'root',
      selectedNodeId: null,
    })
  })

  it('scrubs a Transition node without a temporary signal wire', () => {
    useGraphStore.setState({
      nodes: [{
        id: 'tr',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: nodeData('Transition', { transitionType: 'crossfade', t: 0.25 }),
      }],
    })

    const { getByLabelText, getByTitle } = render(<TransitionBody nodeId="tr" />)
    fireEvent.change(getByLabelText('Scrub transition progress'), { target: { value: '0.75' } })
    fireEvent.click(getByTitle('Use wipe'))

    expect(useGraphStore.getState().nodes[0].data.properties.t).toBe(0.75)
    expect(useGraphStore.getState().nodes[0].data.properties.transitionType).toBe('wipe')
  })

  it('edits CustomPalette stops directly', () => {
    useGraphStore.setState({
      nodes: [{
        id: 'cp',
        type: 'studioNode',
        position: { x: 0, y: 0 },
        data: nodeData('CustomPalette', {
          colors: ['#000000', '#ffffff'],
          positions: [0, 1],
        }),
      }],
    })

    const { getByLabelText, getByText } = render(<CustomPaletteEditorBody nodeId="cp" />)
    fireEvent.change(getByLabelText('Stop 1 color'), { target: { value: '#112233' } })
    fireEvent.click(getByText('add'))

    const props = useGraphStore.getState().nodes[0].data.properties
    expect(props.colors).toContain('#112233')
    expect(props.colors).toHaveLength(3)
    expect(props.positions).toHaveLength(3)
  })
})
