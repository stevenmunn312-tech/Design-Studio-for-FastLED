import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useGraphStore } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import PatternCollectionBody from '../PatternCollectionBody'
import TransitionSetBody from '../TransitionSetBody'

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

describe('node body wheel behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    useGraphStore.setState({
      nodes: [
        {
          id: 'transitions',
          type: 'studioNode',
          position: { x: 0, y: 0 },
          data: nodeData('TransitionSet', { transitions: ['wipe'] }),
        },
        {
          id: 'collection',
          type: 'studioNode',
          position: { x: 0, y: 0 },
          data: nodeData('PatternCollection', { patternIds: ['group-1'], patternSections: {} }),
        },
      ],
      edges: [],
      graphs: {
        root: { id: 'root', name: 'Main' },
        'group-1': { id: 'group-1', name: 'Pulse' },
      },
      graphData: {},
      activeGraphId: 'root',
      selectedNodeId: null,
    })
  })

  it('lets wheel zoom pass through TransitionSet chips', () => {
    const { container } = render(<TransitionSetBody nodeId="transitions" />)
    expect(container.firstElementChild?.className).not.toContain('nowheel')
  })

  it('lets wheel zoom pass through PatternCollection chips', () => {
    const { container } = render(<PatternCollectionBody nodeId="collection" />)
    expect(container.firstElementChild?.className).not.toContain('nowheel')
  })
})
