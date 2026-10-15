import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlayerControlsBody from '../PlayerControlsBody'
import { NODE_LIBRARY, libraryDefaults } from '../../../../state/nodeLibrary'
import { useGraphStore, type StudioEdge, type StudioNode } from '../../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType, category: def.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}

const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th }) as unknown as StudioEdge

describe('PlayerControlsBody', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([], [])
  })

  it('names the node its Controls drive', () => {
    useGraphStore.getState().loadGraph(
      [node('controls', 'ControlMap'), node('player', 'PatternMaster')],
      [edge('chain', 'controls', 'controls', 'player', 'controls')],
    )

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.getByLabelText('Controls destination').textContent).toContain('Music Player')
  })

  it('follows a chained Player Controls to the destination at its end', () => {
    useGraphStore.getState().loadGraph(
      [node('controls', 'ControlMap'), node('downstream', 'ControlMap'), node('show', 'PatternSlideshow')],
      [
        edge('link', 'controls', 'controls', 'downstream', 'controlsIn'),
        edge('chain', 'downstream', 'controls', 'show', 'controls'),
      ],
    )

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.getByLabelText('Controls destination').textContent).toContain('Pattern Slideshow')
  })

  it('says what to do while Controls goes nowhere', () => {
    useGraphStore.getState().loadGraph([node('controls', 'ControlMap')], [])

    render(<PlayerControlsBody nodeId="controls" />)

    expect(screen.getByText(/Wire Controls into/)).toBeTruthy()
  })
})
