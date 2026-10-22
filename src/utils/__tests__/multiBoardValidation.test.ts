import { afterEach, describe, expect, it } from 'vitest'
import {
  boardFqbn,
  boardFqbnTargets,
  boardLabel,
  buildBoardDiagnostics,
  findDeployBlockingErrorsForBoard,
  validateBoards,
} from '../multiBoardValidation'
import { buildGraphDiagnostics, findDeployBlockingErrors, validateGraph } from '../validateGraph'
import { boardPartition } from '../../build/boardPartition'
import { STARTER_TEMPLATES, buildBoardAwareStarter } from '../../state/patterns/starterTemplates'
import { useNetworkCredentialsStore } from '../../state/peripherals/networkCredentials'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

/*
 * Validation of a project with several boards: each partition is validated
 * with its own FQBN, the lists are merged, and the whole root graph adds the
 * findings no partition can make. See docs/design/multi-board.md.
 */

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

let edgeCount = 0
function edge(source: string, target: string, targetHandle = 'frame', sourceHandle = 'frame'): StudioEdge {
  return { id: `e${++edgeCount}`, source, target, sourceHandle, targetHandle } as unknown as StudioEdge
}

const S3 = 'esp32:esp32:esp32s3'
const ESP32 = 'esp32:esp32:esp32'
const UNO = 'arduino:avr:uno'

const board = (id: string, clockSync?: 'leader' | 'follower') => node(id, 'Board', clockSync ? { clockSync } : {})

/** Two boards, each driving its own LED output from its own pattern. */
function twoBoards(extra: { nodes?: StudioNode[]; edges?: StudioEdge[] } = {}) {
  const nodes = [
    board('board-root'),
    board('board-2'),
    node('p1', 'SolidColor'),
    node('out1', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    node('p2', 'Rainbow'),
    node('out2', 'MatrixOutput', { width: 8, height: 8, dataPin: 6, boardId: 'board-2' }),
    ...(extra.nodes ?? []),
  ]
  const edges = [edge('p1', 'out1'), edge('p2', 'out2'), ...(extra.edges ?? [])]
  return { nodes, edges }
}

const titles = (issues: { title: string }[]) => issues.map((issue) => issue.title)

describe('multiBoardValidation — one board', () => {
  it('reads as the one-board validators, byte for byte, on every starter', () => {
    const root = node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' })
    for (const template of STARTER_TEMPLATES) {
      const { nodes, edges } = buildBoardAwareStarter(template, [root], ESP32)
      const all = [root, ...nodes]
      expect(validateBoards(all, edges, { 'board-root': ESP32 }), template.id)
        .toEqual(validateGraph(all, edges, ESP32))
      expect(buildBoardDiagnostics(all, edges, { targets: { 'board-root': ESP32 }, capabilityNodes: all }), template.id)
        .toEqual(buildGraphDiagnostics(all, edges, { selectedFqbn: ESP32, capabilityNodes: all }))
      expect(findDeployBlockingErrorsForBoard(all, edges, 'board-root', ESP32), template.id)
        .toEqual(findDeployBlockingErrors(all, edges, ESP32))
    }
  })

  it('falls back to the default FQBN and copes with a graph that has no Board', () => {
    const nodes = [node('p', 'SolidColor'), node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })]
    const edges = [edge('p', 'out')]
    expect(validateBoards(nodes, edges, {}, undefined, {}, S3)).toEqual(validateGraph(nodes, edges, S3))
    expect(validateBoards([], [], {})).toEqual(validateGraph([], []))
    expect(buildBoardDiagnostics(nodes, edges, { targets: {}, defaultFqbn: S3 }))
      .toEqual(buildGraphDiagnostics(nodes, edges, { selectedFqbn: S3 }))
  })

  it('names boards in root order, the primary first, and resolves each board FQBN', () => {
    const nodes = [board('board-2'), node('p', 'SolidColor'), board('board-root'), board('board-3')]
    expect(boardLabel(nodes, 'board-root')).toBe('Board 1')
    expect(boardLabel(nodes, 'board-2')).toBe('Board 2')
    expect(boardLabel(nodes, 'board-3')).toBe('Board 3')
    expect(boardLabel(nodes, 'board-9')).toBe('Board 1')

    expect(boardFqbn(nodes, { 'board-2': UNO, 'board-root': S3 }, 'board-2')).toBe(UNO)
    expect(boardFqbn(nodes, { 'board-root': S3 }, 'board-3')).toBe(S3)
    expect(boardFqbn(nodes, {}, 'board-3', ESP32)).toBe(ESP32)
    // The primary's target is keyed by the conventional id whatever the primary is called.
    expect(boardFqbn([board('b1'), board('b2')], { 'board-root': S3 }, 'b2')).toBe(S3)

    const targets = boardFqbnTargets(nodes, {
      'board-root': { selectedFqbn: S3, selectedPort: 'COM3' },
      'board-2': { selectedFqbn: UNO, selectedPort: 'COM4' },
    }, 'board-2', ESP32)
    expect(targets).toEqual({ 'board-root': S3, 'board-2': ESP32 })
    expect(boardFqbnTargets(nodes, undefined, 'board-9', S3)).toEqual({ 'board-root': S3 })
  })
})

describe('multiBoardValidation — several boards', () => {
  afterEach(() => {
    useNetworkCredentialsStore.getState().removeCredentials('board-root')
    useNetworkCredentialsStore.getState().removeCredentials('board-2')
  })

  it('validates each board with its own FQBN and prefixes what only that board reports', () => {
    const { nodes, edges } = twoBoards({
      nodes: [node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0 }), node('ch', 'DMXChannel', { channel: 1 }), node('fade', 'BrightnessMod')],
      edges: [edge('dmx', 'ch', 'dmx', 'dmx'), edge('p2', 'fade'), edge('ch', 'fade', 'brightness', 'value')],
    })
    // Board 2 shows the Art-Net-driven pattern through fade → out2.
    edges.push(edge('fade', 'out2'))
    const targets = { 'board-root': S3, 'board-2': UNO }

    const result = validateBoards(nodes, edges, targets)
    const gate = result.errors.filter((error) => error.includes('Art-Net, sACN, DDP and NTP time sync require'))
    expect(gate).toHaveLength(1)
    expect(gate[0].startsWith('Board 2: ')).toBe(true)
    expect(result.errors.some((error) => error.startsWith('Board 1: '))).toBe(false)

    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets })
    const card = diagnostics.find((issue) => issue.id === 'dmx-board-network')
    expect(card?.severity).toBe('error')
    expect(card?.title).toBe('Board 2: Network sync is incompatible with the selected board')

    // Swap the FQBNs and it is the other board's problem — and the other prefix.
    const swapped = validateBoards(nodes, edges, { 'board-root': UNO, 'board-2': S3 })
    expect(swapped.errors.some((error) => error.includes('time sync require'))).toBe(false)
    const gateFor = findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', UNO)
    expect(gateFor.some((error) => error.includes('time sync require'))).toBe(true)
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-root', S3)
      .some((error) => error.includes('time sync require'))).toBe(false)
  })

  it('says a message every board reports once, unprefixed', () => {
    const { nodes, edges } = twoBoards({ nodes: [node('orphan', 'Rainbow')] })
    const result = validateBoards(nodes, edges, { 'board-root': S3, 'board-2': ESP32 })
    const isolated = result.warnings.filter((warning) => warning.includes('not connected to anything'))
    expect(isolated).toEqual(['1 node not connected to anything'])

    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets: { 'board-root': S3, 'board-2': ESP32 } })
    const orphanCards = diagnostics.filter((issue) => issue.nodeIds.includes('orphan'))
    expect(orphanCards).toHaveLength(1)
    expect(orphanCards[0].title.startsWith('Board')).toBe(false)
  })

  it('merges diagnostics by id, the first board winning', () => {
    const { nodes, edges } = twoBoards({ nodes: [node('orphan', 'Rainbow')] })
    const targets = { 'board-root': S3, 'board-2': ESP32 }
    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets })
    const ids = diagnostics.map((issue) => issue.id)
    expect(new Set(ids).size).toBe(ids.length)
    const first = boardPartition(nodes, edges, 'board-root')
    const firstRun = buildGraphDiagnostics(first.nodes, first.edges, { selectedFqbn: S3, capabilityNodes: first.nodes })
    for (const issue of firstRun) {
      const merged = diagnostics.find((entry) => entry.id === issue.id)
      expect(merged).toBeDefined()
      expect(merged!.title.replace(/^Board \d+: /, '')).toBe(issue.title)
      expect(merged!.message).toBe(issue.message)
    }
  })

  it('reports a wire that crosses boards as an error on both boards', () => {
    const { nodes, edges } = twoBoards({
      nodes: [node('pot', 'PotInput', { pin: 34, boardId: 'board-2' }), node('fade', 'BrightnessMod')],
      edges: [edge('pot', 'fade', 'brightness', 'value'), edge('p1', 'fade')],
    })
    edges.push(edge('fade', 'out1'))
    const targets = { 'board-root': S3, 'board-2': ESP32 }

    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets })
    const card = diagnostics.find((issue) => issue.id === 'cross-board-pot-out1')
    expect(card).toMatchObject({
      severity: 'error', category: 'connection', title: 'A wire crosses boards',
      nodeIds: ['pot', 'out1'],
      fix: 'Move the part to the board that shows the pattern, or give that board its own copy of the pattern.',
    })
    expect(card?.message).toContain('PotInput on Board 2')
    expect(card?.message).toContain('MatrixOutput on Board 1')

    const result = validateBoards(nodes, edges, targets)
    expect(result.errors.filter((error) => error.startsWith('A wire crosses boards'))).toHaveLength(1)

    // The gate of each board the wire touches refuses it; a third board's does not.
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-root', S3)
      .some((error) => error.startsWith('A wire crosses boards'))).toBe(true)
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', ESP32)
      .some((error) => error.startsWith('A wire crosses boards'))).toBe(true)
    const three = [...nodes, board('board-3'), node('out3', 'MatrixOutput', { width: 4, height: 4, dataPin: 7, boardId: 'board-3' })]
    expect(findDeployBlockingErrorsForBoard(three, [...edges, edge('p2', 'out3')], 'board-3', ESP32)
      .some((error) => error.startsWith('A wire crosses boards'))).toBe(false)
  })

  it('warns about a board with nothing to drive, instead of calling its output missing', () => {
    const nodes = [
      board('board-root'), board('board-2'),
      node('p1', 'SolidColor'), node('out1', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('pot', 'PotInput', { pin: 34, boardId: 'board-2' }),
    ]
    const edges = [edge('p1', 'out1')]
    const targets = { 'board-root': S3, 'board-2': ESP32 }

    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets })
    expect(diagnostics).toContainEqual(expect.objectContaining({
      id: 'board-drives-nothing-board-2', severity: 'warning', category: 'board',
      title: 'Board 2 drives nothing', nodeIds: ['board-2'],
    }))
    expect(diagnostics.some((issue) => issue.id === 'missing-MatrixOutput')).toBe(false)
    expect(diagnostics.some((issue) => issue.id === 'graph-empty')).toBe(false)

    const result = validateBoards(nodes, edges, targets)
    expect(result.errors.some((error) => error.includes('Missing MatrixOutput node'))).toBe(false)
    expect(result.warnings.some((warning) => warning.startsWith('Board 2 drives nothing'))).toBe(true)

    // A board with an output part of its own drives something.
    const buzzing = [...nodes, node('buzz', 'BuzzerOutput', { pin: 12, boardId: 'board-2' })]
    expect(titles(buildBoardDiagnostics(buzzing, [...edges, edge('pot', 'buzz', 'trigger', 'value')], { targets })))
      .not.toContain('Board 2 drives nothing')
    // The primary is a board like any other once another board has the output.
    const primaryEmpty = [board('board-root'), board('board-2'), node('p2', 'Rainbow'), node('out2', 'MatrixOutput', { width: 8, height: 8, dataPin: 6, boardId: 'board-2' })]
    const primaryDiagnostics = buildBoardDiagnostics(primaryEmpty, [edge('p2', 'out2')], { targets })
    expect(titles(primaryDiagnostics)).toContain('Board 1 drives nothing')
    expect(primaryDiagnostics.some((issue) => issue.id === 'missing-MatrixOutput' || issue.id === 'graph-empty')).toBe(false)
    expect(validateBoards(primaryEmpty, [edge('p2', 'out2')], targets).errors).not.toContain('Missing MatrixOutput node')

    // An empty project is where everyone starts: the primary's card, no warnings.
    const empty = [board('board-root'), board('board-2')]
    const emptyDiagnostics = buildBoardDiagnostics(empty, [], { targets })
    expect(emptyDiagnostics.map((issue) => issue.id)).toEqual(['graph-empty'])
    expect(emptyDiagnostics[0].title).toBe('Nothing here yet')
    expect(validateBoards(empty, [], targets)).toEqual({ errors: ['Missing MatrixOutput node'], warnings: [] })
  })

  it('needs every synced board on the network, with credentials', () => {
    const { nodes, edges } = twoBoards()
    nodes[0] = board('board-root', 'leader')
    nodes[1] = board('board-2', 'follower')

    const off = buildBoardDiagnostics(twoBoards().nodes, twoBoards().edges, { targets: { 'board-root': S3, 'board-2': UNO } })
    expect(off.some((issue) => issue.id.startsWith('board-sync-'))).toBe(false)

    const diagnostics = buildBoardDiagnostics(nodes, edges, { targets: { 'board-root': S3, 'board-2': UNO } })
    expect(diagnostics).toContainEqual(expect.objectContaining({
      id: 'board-sync-network-board-2', severity: 'error', category: 'board',
      title: 'Board 2 cannot keep time with the others',
      fix: 'Choose a Wi-Fi-capable board or add a wired link.', nodeIds: ['board-2'],
    }))
    expect(diagnostics).toContainEqual(expect.objectContaining({
      id: 'board-sync-credentials-board-root', severity: 'error',
      title: 'Board 1 has no Wi-Fi credentials for clock sync',
    }))
    // One problem at a time: the board with no radio is not also asked for a password.
    expect(diagnostics.some((issue) => issue.id === 'board-sync-credentials-board-2')).toBe(false)
    // The one-board validators count a syncing Board as a network user and say
    // the same things in the Art-Net node's words; the sync findings replace those.
    expect(diagnostics.some((issue) => issue.id === 'board-2-board-network')).toBe(false)
    expect(diagnostics.some((issue) => issue.message === 'Board is missing its Wi-Fi SSID')).toBe(false)

    const result = validateBoards(nodes, edges, { 'board-root': S3, 'board-2': UNO })
    expect(result.errors.some((error) => error.startsWith('Board 2 cannot keep time with the others'))).toBe(true)
    expect(result.errors.some((error) => error.startsWith('Board 1 has no Wi-Fi credentials for clock sync'))).toBe(true)
    expect(result.errors.some((error) => error.includes('time sync require'))).toBe(false)
    expect(result.warnings.some((warning) => warning.includes('missing its Wi-Fi SSID'))).toBe(false)
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', UNO).some((error) => error.includes('time sync require'))).toBe(false)

    // An Art-Net node on the same board keeps the gate in its own words too.
    const withDmx = [...nodes, node('dmx', 'DMXInput', { inputMode: 'Art-Net', universe: 0 })]
    const dmxEdges = [...edges, edge('dmx', 'out2', 'frame', 'dmx')]
    expect(validateBoards(withDmx, dmxEdges, { 'board-root': S3, 'board-2': UNO }).errors
      .some((error) => error.includes('time sync require'))).toBe(true)

    // Each board's deploy gate carries its own sync errors only.
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', UNO)).toContainEqual(expect.stringContaining('Board 2 cannot keep time'))
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-2', UNO)).not.toContainEqual(expect.stringContaining('Board 1 has no Wi-Fi'))
    expect(findDeployBlockingErrorsForBoard(nodes, edges, 'board-root', S3)).toContainEqual(expect.stringContaining('Board 1 has no Wi-Fi'))

    useNetworkCredentialsStore.getState().setCredentials('board-root', { ssid: 'bench', password: 'x' })
    useNetworkCredentialsStore.getState().setCredentials('board-2', { ssid: 'bench', password: 'x' })
    const credentialed = buildBoardDiagnostics(nodes, edges, { targets: { 'board-root': S3, 'board-2': ESP32 } })
    expect(credentialed.some((issue) => issue.id.startsWith('board-sync-'))).toBe(false)

    // A wired link stands in for both the radio and the credentials.
    const wired = [...nodes, node('eth', 'EthernetModule', { boardId: 'board-2' })]
    useNetworkCredentialsStore.getState().removeCredentials('board-2')
    const wiredDiagnostics = buildBoardDiagnostics(wired, edges, { targets: { 'board-root': S3, 'board-2': UNO } })
    expect(wiredDiagnostics.some((issue) => issue.id === 'board-sync-network-board-2')).toBe(false)
    expect(wiredDiagnostics.some((issue) => issue.id === 'board-sync-credentials-board-2')).toBe(false)
  })

  it("warns when a follower's collection is not in the leader's order", () => {
    useNetworkCredentialsStore.getState().setCredentials('board-root', { ssid: 'bench', password: 'x' })
    useNetworkCredentialsStore.getState().setCredentials('board-2', { ssid: 'bench', password: 'x' })
    const build = (followerOrder: string[]) => {
      const { nodes, edges } = twoBoards({
        nodes: [
          node('c1', 'PatternCollection', { patternIds: ['a', 'b', 'c'] }),
          node('c2', 'PatternCollection', { patternIds: followerOrder }),
        ],
        edges: [edge('c1', 'out1', 'frame', 'frame'), edge('c2', 'out2', 'frame', 'frame')],
      })
      nodes[0] = board('board-root', 'leader')
      nodes[1] = board('board-2', 'follower')
      return { nodes, edges }
    }
    const targets = { 'board-root': S3, 'board-2': ESP32 }

    const shuffled = build(['b', 'a', 'c'])
    const diagnostics = buildBoardDiagnostics(shuffled.nodes, shuffled.edges, { targets })
    expect(diagnostics).toContainEqual(expect.objectContaining({
      id: 'board-sync-collection-board-2', severity: 'warning', category: 'show',
      title: "Board 2's show will not stay in step",
      fix: 'Use the same collection, in the same order, on every synced board.',
      nodeIds: ['c2', 'c1'],
    }))
    expect(validateBoards(shuffled.nodes, shuffled.edges, targets).warnings)
      .toContainEqual(expect.stringContaining("Board 2's show will not stay in step"))

    const same = build(['a', 'b', 'c'])
    expect(buildBoardDiagnostics(same.nodes, same.edges, { targets }).some((issue) => issue.id === 'board-sync-collection-board-2')).toBe(false)

    // With sync off the order is each board's own business.
    const unsynced = build(['c', 'b', 'a'])
    unsynced.nodes[0] = board('board-root')
    unsynced.nodes[1] = board('board-2')
    expect(buildBoardDiagnostics(unsynced.nodes, unsynced.edges, { targets }).some((issue) => issue.id === 'board-sync-collection-board-2')).toBe(false)
  })
})
