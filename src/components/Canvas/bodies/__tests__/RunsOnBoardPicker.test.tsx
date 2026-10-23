import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RunsOnBoardPicker from '../RunsOnBoardPicker'
import { useGraphStore, ROOT_GRAPH_ID, rootGraphNodes } from '../../../../state/graphStore'
import { NODE_LIBRARY } from '../../../../state/nodeLibrary'
import type { StudioNode } from '../../../../state/graphStore'

// A network endpoint says which board serves it once a project has two.

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'input',
      properties, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const PROFILE = { profileId: 'esp32-generic-devkit-38pin' }

function reset(nodes: StudioNode[]) {
  useGraphStore.setState({
    nodes, edges: [], selectedNodeId: null, activeGraphId: ROOT_GRAPH_ID, graphData: {}, trusted: true,
  } as never)
}

const remoteProps = () => rootGraphNodes(useGraphStore.getState())
  .find((n) => n.id === 'remote')?.data.properties as Record<string, unknown>

describe('RunsOnBoardPicker', () => {
  beforeEach(() => reset([
    node('board-root', 'Board', PROFILE),
    node('board-2', 'Board', PROFILE),
    node('remote', 'WebRemoteInput'),
  ]))

  it('reads an endpoint with no boardId as the primary', () => {
    render(<RunsOnBoardPicker nodeId="remote" />)
    const select = screen.getByLabelText('Runs on board') as HTMLSelectElement
    expect(select.value).toBe('board-root')
    expect([...select.options].map((option) => option.textContent?.split(' · ')[0])).toEqual(['Board 1', 'Board 2'])
  })

  it('writes the chosen board, and clears it again for the primary', () => {
    render(<RunsOnBoardPicker nodeId="remote" />)
    const select = screen.getByLabelText('Runs on board') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'board-2' } })
    expect(remoteProps().boardId).toBe('board-2')
    expect(select.value).toBe('board-2')

    fireEvent.change(select, { target: { value: 'board-root' } })
    expect('boardId' in remoteProps()).toBe(false)
  })

  it('reads a boardId naming a removed board as the primary', () => {
    reset([node('board-root', 'Board', PROFILE), node('board-2', 'Board', PROFILE), node('remote', 'WebRemoteInput', { boardId: 'board-9' })])
    render(<RunsOnBoardPicker nodeId="remote" />)
    expect((screen.getByLabelText('Runs on board') as HTMLSelectElement).value).toBe('board-root')
  })

  it('draws nothing in a one-board project', () => {
    reset([node('board-root', 'Board', PROFILE), node('remote', 'WebRemoteInput')])
    const { container } = render(<RunsOnBoardPicker nodeId="remote" />)
    expect(container.innerHTML).toBe('')
  })
})
