/*
 * The whole repair journey, end to end, on the real validator, deploy gate,
 * Graph Health drawer and store — no reload in between.
 *
 * The failure the app review started from: a touch screen's Controls wired
 * into an LED output on a Music Player build. The player owns the lamp, so its
 * firmware cannot read that wire and Upload is blocked. Following the card
 * must lead to the wire, fix it in one undoable step, and leave Upload
 * unblocked the moment it is done.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import GraphHealthDrawer from '../GraphHealthDrawer'
import { ROOT_GRAPH_ID, useGraphStore, type StudioEdge, type StudioNode } from '../../../state/graphStore'
import { useUiStore } from '../../../state/uiStore'
import { useUploadStore } from '../../../state/uploadStore'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { findDeployBlockingErrors } from '../../../utils/validateGraph'
import { uploadBlockReason } from '../../../utils/uploadBlockReason'

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

const FQBN = 'esp32:esp32:esp32'
const blockers = () => {
  const s = useGraphStore.getState()
  return findDeployBlockingErrors(s.nodes, s.edges, FQBN, s.displayDocuments)
}
/** What the Upload tab would say beside its button, with the tools ready. */
const uploadSays = () => uploadBlockReason({
  busy: false, hasBuildOutput: true, isShowUpload: false, showHasContent: true,
  waitingForTrust: false, graphBlockerCount: blockers().length, preparing: false,
  otherBlockers: [], tools: [],
})

describe('repair journey: touch Controls on an LED output, on a Music Player build', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useUploadStore.setState({ selectedFqbn: FQBN })
    useUiStore.setState({
      graphHealthOpen: true, fitViewRequest: { nonce: 0 }, locatedEdgeIds: [],
      workspaceMode: 'upload', designWorkspaceView: { kind: 'graph' },
    })
    useGraphStore.getState().loadGraph([
      node('player', 'PatternMaster'),
      node('col', 'PatternCollection'),
      node('out', 'MatrixOutput', { form: 'strip', ledCount: 30, dataPin: 27 }),
      node('tft', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', dcPin: 16 }),
      node('tft-touch', 'TouchInput', { panelId: 'tft' }),
      node('sd', 'SDCard', { sdCsPin: 13, sdSckPin: 18, sdMisoPin: 19, sdMosiPin: 23 }),
      node('amp', 'Amplifier'),
    ], [
      edge('set', 'col', 'patternset', 'player', 'patternset'),
      edge('frame', 'player', 'frame', 'out', 'frame'),
      edge('shown', 'player', 'display', 'tft', 'display'),
      edge('lamp', 'tft-touch', 'controls', 'out', 'controls'),
    ], { activeGraphId: ROOT_GRAPH_ID, graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } } })
    // Let the load's own debounced history entry land before clearing, as it
    // long has by the time anyone clicks a repair.
    vi.advanceTimersByTime(1000)
    useGraphStore.temporal.getState().clear()
  })

  it('goes from a blocked Upload to a clear one, and undo and redo both hold', () => {
    // 1. Upload is blocked, and says where to look.
    const blocked = uploadSays()
    expect(blocked?.action).toEqual({ kind: 'show-graph-health' })
    expect(blockers().some((message) => /cannot read Enabled, Brightness, Controls/.test(message))).toBe(true)

    // 2. Graph Health has the card, pointing at the one wire.
    const { getByText, queryByText } = render(<GraphHealthDrawer />)
    const card = getByText('Output firmware cannot honour these controls').closest('article')!
    fireEvent.click(within(card).getByRole('button', { name: 'Show the wire' }))
    expect(useUiStore.getState().workspaceMode).toBe('graph')
    expect(useUiStore.getState().locatedEdgeIds).toEqual(['lamp'])

    // 3. The card makes the fix itself.
    fireEvent.click(within(card).getByRole('button', { name: 'Move the wire' }))
    const moved = useGraphStore.getState().edges.find((entry) => entry.source === 'tft-touch' && entry.sourceHandle === 'controls')
    expect(moved?.target).toBe('player')
    expect(useUiStore.getState().locatedEdgeIds).toEqual([])

    // 4. Back on Upload, with no reload: nothing in the graph is in the way.
    expect(blockers().filter((message) => /cannot read Enabled, Brightness, Controls/.test(message))).toEqual([])
    expect(queryByText('Output firmware cannot honour these controls')).toBeNull()
    // Nothing at all is left in the way: the fixture is otherwise a clean build.
    expect(blockers()).toEqual([])
    expect(uploadSays()?.action?.kind).not.toBe('show-graph-health')

    // 5. The fix is one undo step, and redo puts it back.
    vi.advanceTimersByTime(1000)
    useGraphStore.temporal.getState().undo()
    expect(useGraphStore.getState().edges.find((entry) => entry.id === 'lamp')?.target).toBe('out')
    expect(blockers().some((message) => /cannot read Enabled, Brightness, Controls/.test(message))).toBe(true)
    useGraphStore.temporal.getState().redo()
    expect(blockers().some((message) => /cannot read Enabled, Brightness, Controls/.test(message))).toBe(false)
  })

  it('leaves a wire into Enabled to the author, since it needs a mapping only they can choose', () => {
    useGraphStore.setState((s) => ({
      nodes: [...s.nodes, node('btn', 'ButtonInput', { pin: 4 })],
      edges: [...s.edges.filter((entry) => entry.id !== 'lamp'), edge('press', 'btn', 'pressed', 'out', 'enabled')],
    }))
    const { getByText } = render(<GraphHealthDrawer />)
    const card = getByText('Output firmware cannot honour these controls').closest('article')!
    expect(within(card).queryByRole('button', { name: 'Move the wire' })).toBeNull()
    expect(within(card).getByRole('button', { name: 'Show the wire' })).toBeTruthy()
  })
})
