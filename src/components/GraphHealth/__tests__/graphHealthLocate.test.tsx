/*
 * Locate goes to the cause. A connection problem shows the wire, not every
 * node the card could name; a screen problem opens the screen.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import GraphHealthDrawer from '../GraphHealthDrawer'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { applyDisplayTemplate } from '../../../state/displayTemplates'
import { createDisplayDocument } from '../../../state/displayEditor'
import { CUSTOM_DESIGN_LAYOUT } from '../../../state/transportDisplay'
import { buildGraphDiagnostics } from '../../../utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

beforeEach(() => {
  useUiStore.setState({
    graphHealthOpen: true, fitViewRequest: { nonce: 0 }, locatedEdgeIds: [],
    workspaceMode: 'upload', designWorkspaceView: { kind: 'graph' },
  })
  useUploadStore.setState({ selectedFqbn: 'esp32:esp32:esp32s3' })
})

describe('a wire the build cannot read', () => {
  // A button wired into an LED output's Enabled on a Music Player build: the
  // player owns its lamp, so that one wire is the whole problem.
  beforeEach(() => {
    useGraphStore.getState().loadGraph([
      node('player', 'PatternMaster'),
      node('out', 'MatrixOutput', { form: 'strip', ledCount: 30, dataPin: 27 }),
      node('btn', 'ButtonInput', { pin: 4 }),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier'),
    ], [
      edge('f', 'player', 'frame', 'out', 'frame'),
      edge('lamp', 'btn', 'pressed', 'out', 'enabled'),
    ], { activeGraphId: ROOT_GRAPH_ID, graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } } })
  })

  it('names that wire and its two ends rather than every output on the canvas', () => {
    const s = useGraphStore.getState()
    const card = buildGraphDiagnostics(s.nodes, s.edges).find((d) => d.title === 'Output firmware cannot honour these controls')
    expect(card?.edgeIds).toEqual(['lamp'])
    expect(card?.nodeIds).toEqual(['out', 'btn'])
  })

  it('shows the wire on the canvas, lit, and a click on the canvas lets it go', () => {
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Output firmware cannot honour these controls').closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Show the wire' }))
    expect(useUiStore.getState().workspaceMode).toBe('graph')
    expect(useUiStore.getState().locatedEdgeIds).toEqual(['lamp'])
    expect(useUiStore.getState().fitViewRequest.nodeIds).toEqual(['out', 'btn'])
    useUiStore.getState().clearLocatedEdges()
    expect(useUiStore.getState().locatedEdgeIds).toEqual([])
  })
})

describe('a screen whose controls are waiting', () => {
  it('opens that screen in the designer', () => {
    const document = applyDisplayTemplate(createDisplayDocument('screen', 320, 240), 'minimal-transport')
    useGraphStore.getState().loadGraph([
      node('tft', 'TransportDisplay', {
        partId: 'st7789v-xpt2046-touch-240x320', displayId: 'screen', tftLayout: CUSTOM_DESIGN_LAYOUT,
      }),
      node('tft-touch', 'TouchInput', { panelId: 'tft' }),
    ], [], { activeGraphId: ROOT_GRAPH_ID, graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } } })
    useGraphStore.getState().setDisplayDocument(document)

    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Screen controls aren’t connected yet').closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Open screen design' }))
    expect(useUiStore.getState().designWorkspaceView).toEqual({ kind: 'display', displayId: 'screen' })
  })
})
