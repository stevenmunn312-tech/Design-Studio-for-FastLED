import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Inspector from '../Inspector'
import { useGraphStore } from '../../../state/graphStore'
import { usePerformanceBakeStore } from '../../../state/performanceBakeStore'
import { useUiStore } from '../../../state/uiStore'

function makeTextNode(properties: Record<string, unknown> = {}) {
  return {
    id: 'text-1',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Text',
      nodeType: 'Text',
      category: 'pattern',
      properties: {
        text: 'HELLO',
        x: 0.5,
        y: 0.5,
        scroll: 0,
        wrap: false,
        r: 0,
        g: 255,
        b: 255,
        hAlign: 'center',
        vAlign: 'middle',
        scrollAxis: 'horizontal',
        letterSpacing: 1,
        ...properties,
      },
      inputs: [],
      outputs: [],
    },
  } as never
}

describe('Inspector Text authoring', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.setState({
      nodes: [makeTextNode()],
      edges: [],
      selectedNodeId: 'text-1',
      graphData: {},
      graphs: { root: { id: 'root', name: 'Main' } },
      activeGraphId: 'root',
    })
    usePerformanceBakeStore.setState({ byNode: {} })
    useUiStore.setState({ statusText: 'Ready', statusLevel: 'idle' })
  })

  it('uses a multiline textarea for the Text node text property', () => {
    const { getByLabelText } = render(<Inspector />)
    const textarea = getByLabelText('text') as HTMLTextAreaElement
    expect(textarea.tagName).toBe('TEXTAREA')
    fireEvent.change(textarea, { target: { value: 'HELLO\nWORLD' } })
    expect(useGraphStore.getState().nodes[0].data.properties.text).toBe('HELLO\nWORLD')
  })

  it('shows the custom font manager details and can reset to the built-in font', () => {
    useGraphStore.setState({
      nodes: [makeTextNode({ font: { w: 4, h: 6, glyphs: { A: [15, 9, 15, 9, 9, 0] } } })],
      selectedNodeId: 'text-1',
    })
    const { getByText } = render(<Inspector />)
    expect(getByText('custom')).toBeTruthy()
    expect(getByText('4×6')).toBeTruthy()
    expect(getByText('newline-aware preview + firmware')).toBeTruthy()
    fireEvent.click(getByText('Reset to built-in'))
    expect(useGraphStore.getState().nodes[0].data.properties.font).toBeUndefined()
  })
})
