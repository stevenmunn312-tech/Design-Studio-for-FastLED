import { describe, it, expect } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { ReactFlowProvider, Position } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import GlowEdge from '../GlowEdge'
import { boardLinkWireLabel, boardLinkWireLabels, NO_BOARD_LINK_LABELS } from '../boardLinkWireLabels'
import { useUiStore } from '../../../state/uiStore'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

// A root wire a board link carries is drawn as a link wire: dashed, with a
// radio mark that names the two boards. See docs/design/board-links.md.

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, target, sourceHandle, targetHandle } as StudioEdge
}

const nodes = [
  node('board-root', 'Board'),
  node('board-2', 'Board'),
  node('board-3', 'Board'),
  node('player', 'PatternMaster'),
  node('leds', 'MatrixOutput'),
  node('enc', 'EncoderInput', { boardId: 'board-2' }),
  node('pot', 'PotInput', { boardId: 'board-3' }),
  node('map', 'MapRange'),
]
const edges = [
  edge('local', 'player', 'frame', 'leds', 'frame'),
  edge('linked', 'enc', 'position', 'player', 'volume'),
  edge('alsoLocal', 'pot', 'value', 'map', 'value'),
]

describe('board link wire labels', () => {
  it('flags only the wires a link carries', () => {
    const labels = boardLinkWireLabels(nodes, edges)
    expect([...labels.keys()]).toEqual(['linked'])
    expect(labels.get('linked')).toBe('Board 2 to Board 1 over ESP-NOW')
  })

  it('lists every receiving board', () => {
    const boards = nodes.slice(0, 3)
    expect(boardLinkWireLabel(boards, { senderBoardId: 'board-root', receiverBoardIds: ['board-2', 'board-3'] }))
      .toBe('Board 1 to Board 2 and Board 3 over ESP-NOW')
  })

  it('reuses its answer while only positions change, and is empty for one board', () => {
    const first = boardLinkWireLabels(nodes, edges)
    const dragged = nodes.map((entry) => entry.id === 'map' ? { ...entry, position: { x: 40, y: 0 } } : entry)
    expect(boardLinkWireLabels(dragged, edges)).toBe(first)
    const oneBoard = nodes.filter((entry) => entry.id !== 'board-2' && entry.id !== 'board-3')
    expect(boardLinkWireLabels(oneBoard, edges)).toBe(NO_BOARD_LINK_LABELS)
  })
})

function renderEdge(boardLink: string | undefined) {
  const props = {
    id: 'linked', source: 'enc', target: 'player', sourceHandleId: 'position', targetHandleId: 'volume',
    sourceX: 0, sourceY: 0, targetX: 200, targetY: 0,
    sourcePosition: Position.Right, targetPosition: Position.Left,
    data: { boardLink },
  } as unknown as EdgeProps
  return render(
    <ReactFlowProvider>
      <svg><GlowEdge {...props} /></svg>
    </ReactFlowProvider>,
  )
}

describe('GlowEdge link wire', () => {
  for (const effects of [true, false]) {
    it(`draws the radio mark and its tooltip with UI effects ${effects ? 'on' : 'off'}`, () => {
      useUiStore.setState({ uiEffectsEnabled: effects })
      const { container } = renderEdge('Board 2 to Board 1 over ESP-NOW')
      const mark = container.querySelector('[data-board-link]')!
      expect(mark.getAttribute('data-board-link')).toBe('Board 2 to Board 1 over ESP-NOW')
      expect(container.querySelector('[stroke-dasharray="8 4"]')).not.toBeNull()
      expect(document.querySelector('[role="tooltip"]')).toBeNull()
      fireEvent.mouseEnter(mark, { clientX: 200, clientY: 150 })
      // On the page, not in the canvas: the nodes drawn after every edge
      // would otherwise cover it.
      const tip = document.querySelector('[role="tooltip"]')!
      expect(tip.textContent).toBe('Board 2 to Board 1 over ESP-NOW')
      expect(container.contains(tip)).toBe(false)
      fireEvent.mouseLeave(mark)
      expect(document.querySelector('[role="tooltip"]')).toBeNull()
    })

    it(`draws a plain wire plainly with UI effects ${effects ? 'on' : 'off'}`, () => {
      useUiStore.setState({ uiEffectsEnabled: effects })
      const { container } = renderEdge(undefined)
      expect(container.querySelector('[data-board-link]')).toBeNull()
      expect(container.querySelector('[stroke-dasharray="8 4"]')).toBeNull()
    })
  }
})
