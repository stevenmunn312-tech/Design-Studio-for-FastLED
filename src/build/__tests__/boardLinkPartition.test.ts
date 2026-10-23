import { describe, it, expect } from 'vitest'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import {
  boardLinkInNodeId,
  boardLinkOutNodeId,
  boardLinkSchema,
  boardLinkWires,
  boardPartition,
  findCrossBoardIssues,
  isSinkNodeType,
} from '../boardPartition'
import { CUSTOM_DESIGN_LAYOUT } from '../../state/displays/transportDisplay'
import {
  BOARD_LINK_IN_NODE_TYPE,
  BOARD_LINK_OUT_NODE_TYPE,
  boardLinkPropertiesOf,
  isMomentaryBoolSource,
} from '../boardLinks'

function node(
  id: string,
  nodeType: string,
  properties: Record<string, unknown> = {},
  ports: { inputs?: { id: string; dataType: string }[]; outputs?: { id: string; dataType: string }[] } = {},
): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'pattern', properties,
      inputs: ports.inputs ?? [], outputs: ports.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`, source, target, sourceHandle, targetHandle } as StudioEdge
}

const ids = (nodes: readonly StudioNode[]) => nodes.map((n) => n.id)
const on2 = { boardId: 'board-2' }

// Board 1 runs the LEDs and the music; Board 2 the screen and the controls.
const base = [
  node('board-root', 'Board'),
  node('board-2', 'Board'),
  node('player', 'PatternMaster'),
  node('leds', 'MatrixOutput'),
  node('controls', 'ControlMap'),
  node('enc', 'EncoderInput', on2),
  node('panel', 'TransportDisplay', on2),
]
const baseEdges = [
  edge('player', 'frame', 'leds', 'frame'),
  edge('controls', 'controls', 'player', 'controls'),
]

describe('board links — the partition', () => {
  it('sends the encoder and computes the map where it is used', () => {
    const nodes = [...base, node('map', 'MapRange')]
    const edges = [...baseEdges, edge('enc', 'position', 'map', 'value'), edge('map', 'result', 'player', 'volume')]
    const one = boardPartition(nodes, edges, 'board-root')
    const two = boardPartition(nodes, edges, 'board-2')
    expect(ids(one.nodes)).toContain('map')
    expect(ids(one.nodes)).not.toContain('enc')
    expect(ids(two.nodes)).not.toContain('map')
    expect(ids(two.nodes)).toContain('enc')

    const slot = { sourceNodeId: 'enc', sourceHandle: 'position' }
    const linkIn = one.nodes.find((n) => n.id === boardLinkInNodeId(slot))!
    expect(linkIn.data.nodeType).toBe(BOARD_LINK_IN_NODE_TYPE)
    expect(boardLinkPropertiesOf(linkIn)).toMatchObject({
      slot: 0, senderBoardId: 'board-2', sourceNodeId: 'enc', sourceHandle: 'position', dataType: 'float', momentary: false,
      start: 0,
    })
    // Both sketches compile from one context: the frame order and each sender's table.
    expect(boardLinkPropertiesOf(linkIn)!.link).toMatchObject({
      boardOrder: ['board-root', 'board-2'], channel: 1, linkId: null,
      frames: { 'board-2': [{ index: 0, kind: 'float' }] },
    })
    // The wire keeps its id and now starts at the link-in.
    const wire = one.edges.find((e) => e.id === 'e-enc-position-map-value')!
    expect(wire.source).toBe(boardLinkInNodeId(slot))
    expect(wire.target).toBe('map')

    const linkOut = two.nodes.find((n) => n.id === boardLinkOutNodeId(slot))!
    expect(linkOut.data.nodeType).toBe(BOARD_LINK_OUT_NODE_TYPE)
    expect(two.edges.some((e) => e.source === 'enc' && e.target === linkOut.id)).toBe(true)
    expect(isSinkNodeType(BOARD_LINK_OUT_NODE_TYPE)).toBe(true)
    expect(findCrossBoardIssues(nodes, edges)).toEqual([])
  })

  it('sends the player display to the panel and a press back to the player', () => {
    const edges = [
      ...baseEdges,
      edge('player', 'display', 'panel', 'display'),
      edge('enc', 'pressed', 'player', 'next'),
    ]
    const { slots, hash } = boardLinkSchema(base, edges)
    expect(slots.map((s) => [s.senderBoardId, s.slot, s.sourceNodeId, s.sourceHandle, s.dataType, s.momentary])).toEqual([
      ['board-root', 0, 'player', 'display', 'display', false],
      ['board-2', 0, 'enc', 'pressed', 'bool', true],
    ])
    expect(slots[0].receivers).toEqual([{ boardId: 'board-2', nodeId: 'panel', handle: 'display' }])
    expect(hash).not.toBe(0)
    // The player is Board 1's: its LED output is there.
    expect(ids(boardPartition(base, edges, 'board-2').nodes)).not.toContain('player')
    expect(boardLinkWires(base, edges).get('e-player-display-panel-display')).toEqual({
      senderBoardId: 'board-root', receiverBoardIds: ['board-2'],
    })
  })

  it('sends only the display fields the receiving panel draws, one index each', () => {
    const edges = [
      ...baseEdges,
      edge('player', 'display', 'panel', 'display'),
      edge('enc', 'pressed', 'player', 'next'),
    ]
    const nodes = base.map((n) => (n.id === 'panel'
      ? node('panel', 'TransportDisplay', { ...on2, tftLayout: 'Fixed Transport' }) : n))
    const { slots } = boardLinkSchema(nodes, edges)
    expect(slots[0].displayKind).toBe('player')
    // Fixed Transport draws title, pattern, play state and volume, in the catalogue's order.
    expect(slots[0].fields).toEqual([
      { id: 'title', kind: 'text', index: 0 },
      { id: 'playing', kind: 'bool', index: 1 },
      { id: 'volume', kind: 'float', index: 2 },
      { id: 'patternName', kind: 'text', index: 3 },
    ])
    expect(slots[1].link!.frames['board-2']).toEqual([{ index: 0, kind: 'press' }])
    expect(slots[0].link!.frames['board-root'].map((entry) => entry.kind)).toEqual(['text', 'bool', 'float', 'text'])
    // A panel that draws more moves the indexes, so the hash moves with them.
    const nowPlaying = base.map((n) => (n.id === 'panel'
      ? node('panel', 'TransportDisplay', { ...on2, tftLayout: 'Now Playing' }) : n))
    expect(boardLinkSchema(nowPlaying, edges).hash).not.toBe(boardLinkSchema(nodes, edges).hash)
  })

  it('reads a screen design\'s bound fields and a Song Info node\'s wired outputs', () => {
    const designed = base.map((n) => (n.id === 'panel'
      ? node('panel', 'TransportDisplay', { ...on2, tftLayout: 'Custom design', displayId: 'doc', widgetSources: { w1: { field: 'elapsed' }, w2: { field: 'title' } } })
      : n))
    const edges = [...baseEdges, edge('player', 'display', 'panel', 'display')]
    expect(boardLinkSchema(designed, edges).slots[0].fields!.map((field) => field.id)).toEqual(['title', 'elapsed'])

    const nodes = [...base, node('song', 'SongInfo'), node('seg', 'SegmentDisplay', on2), node('fmt', 'FormatNumber')]
    const songEdges = [
      ...baseEdges,
      edge('player', 'display', 'song', 'display'),
      edge('song', 'artist', 'fmt', 'value'),
      edge('fmt', 'text', 'panel', 'widget:w1:value'),
    ]
    const two = boardPartition(nodes, songEdges, 'board-2')
    expect(ids(two.nodes)).toContain('song')
    const linkIn = two.nodes.find((n) => n.data.nodeType === BOARD_LINK_IN_NODE_TYPE)!
    expect(boardLinkPropertiesOf(linkIn)!.fields).toEqual([{ id: 'artist', kind: 'text', index: 0 }])
  })

  it('refuses a reading the receiving panel cannot draw, rather than sending an empty slot', () => {
    // An OLED Pattern Browser draws a slideshow from thumbnails only the
    // sending board has: nothing of it is carried.
    const nodes = [
      node('board-root', 'Board'), node('board-2', 'Board'),
      node('show', 'PatternSlideshow'), node('leds', 'MatrixOutput'), node('oled', 'InfoDisplay', on2),
    ]
    const edges = [edge('show', 'frame', 'leds', 'frame'), edge('show', 'display', 'oled', 'display')]
    expect(boardLinkSchema(nodes, edges).slots).toEqual([])
    expect(findCrossBoardIssues(nodes, edges)).toEqual([{
      sourceNodeId: 'show', targetNodeId: 'oled', sourceBoardId: 'board-root', targetBoardId: 'board-2', dataType: 'display',
    }])
    const two = boardPartition(nodes, edges, 'board-2')
    expect(two.nodes.some((n) => n.data.nodeType === BOARD_LINK_IN_NODE_TYPE)).toBe(false)
    expect(boardPartition(nodes, edges, 'board-root').nodes.some((n) => n.data.nodeType === BOARD_LINK_OUT_NODE_TYPE)).toBe(false)
  })

  it('reads a feedback loop the same whichever node the walk meets first', () => {
    // A microphone on Board 2 feeds a loop of two patterns; the loop's frame
    // reaches Board 1's LEDs. Both patterns are Board 2's to compute, in
    // either root order, and the finding names the microphone's wire.
    for (const order of [['fxA', 'fxB'], ['fxB', 'fxA']]) {
      const nodes = [
        node('board-root', 'Board'), node('board-2', 'Board'),
        node('mic', 'MicInput', on2),
        ...order.map((id) => node(id, 'Juggle')),
        node('leds', 'MatrixOutput'),
      ]
      const edges = [
        edge('fxB', 'frame', 'fxA', 'frame'),
        edge('mic', 'audio', 'fxA', 'audio'),
        edge('fxA', 'frame', 'fxB', 'frame'),
        edge('fxA', 'frame', 'leds', 'frame'),
        edge('fxB', 'frame', 'leds', 'frame'),
      ]
      const one = ids(boardPartition(nodes, edges, 'board-root').nodes)
      expect(one).not.toContain('fxA')
      expect(one).not.toContain('fxB')
      expect(findCrossBoardIssues(nodes, edges).map((issue) => [issue.sourceNodeId, issue.dataType])).toEqual([['mic', 'audio']])
    }
  })

  it('carries a screen design’s Controls as the fields its role-stamped widgets publish', () => {
    const panel = node('panel', 'TransportDisplay', { ...on2, tftLayout: CUSTOM_DESIGN_LAYOUT, displayId: 'screen' })
    const touch = node('touch', 'TouchInput', { ...on2, panelId: 'panel' }, {
      outputs: [
        { id: 'controls', dataType: 'playercontrols' },
        { id: 'widget:play:out', dataType: 'bool', controlRole: 'transportPlayPause', widgetType: 'Toggle' } as never,
        { id: 'widget:skip:out', dataType: 'bool', controlRole: 'transportNext', widgetType: 'Button' } as never,
        { id: 'widget:vol:out', dataType: 'float', controlRole: 'transportVolume', widgetType: 'Slider' } as never,
        // A hand-placed widget with no role stays off the bundle.
        { id: 'widget:mine:out', dataType: 'bool' },
      ],
    })
    const nodes = [...base.filter((n) => n.id !== 'panel'), panel, touch]
    // The panel's own readings are another wire's business (see the display
    // cases above); this one is the Controls alone.
    const edges = [...baseEdges, edge('touch', 'controls', 'player', 'controls')]
    const slot = boardLinkSchema(nodes, edges).slots.find((entry) => entry.dataType === 'playercontrols')!
    expect(slot.senderBoardId).toBe('board-2')
    expect(slot.fields!.map((field) => [field.id, field.kind])).toEqual([
      ['playPause', 'press'], ['next', 'press'], ['volume', 'float'], ['volumeSet', 'bool'],
    ])
    expect(findCrossBoardIssues(nodes, edges)).toEqual([])
    // A widget wired on its own has a job already, and leaves the bundle.
    const direct = [...edges, edge('touch', 'widget:skip:out', 'player', 'next')]
    const fields = boardLinkSchema(nodes, direct).slots.find((entry) => entry.dataType === 'playercontrols')!.fields!
    expect(fields.map((field) => field.id)).not.toContain('next')
  })

  it('sends a linked clock whole, as one datetime', () => {
    const nodes = [...base, node('rtc', 'RTCInput')]
    const edges = [...baseEdges, edge('rtc', 'display', 'panel', 'display')]
    expect(boardLinkSchema(nodes, edges).slots[0].fields).toEqual([{ id: 'dateTime', kind: 'datetime', index: 0 }])
  })

  it('refuses audio across boards and names the type', () => {
    const nodes = [...base, node('mic', 'MicInput', on2)]
    const edges = [...baseEdges, edge('mic', 'audio', 'player', 'audio')]
    expect(findCrossBoardIssues(nodes, edges)).toEqual([{
      sourceNodeId: 'mic', targetNodeId: 'player', sourceBoardId: 'board-2', targetBoardId: 'board-root', dataType: 'audio',
    }])
    expect(boardLinkSchema(nodes, edges).slots).toEqual([])
  })

  it('keeps the hash and slot numbers across an edit elsewhere in the graph', () => {
    const edges = [...baseEdges, edge('player', 'display', 'panel', 'display')]
    const before = boardLinkSchema(base, edges).hash
    const nodes = [...base, node('rain', 'Rainbow')]
    expect(boardLinkSchema(nodes, edges).hash).toBe(before)
    const more = [...edges, edge('enc', 'position', 'player', 'volume')]
    expect(boardLinkSchema(base, more).hash).not.toBe(before)
  })

  it('anchors a network endpoint to its board', () => {
    const nodes = [...base, node('remote', 'WebRemoteInput', on2)]
    expect(ids(boardPartition(nodes, baseEdges, 'board-2').nodes)).toContain('remote')
    expect(ids(boardPartition(nodes, baseEdges, 'board-root').nodes)).not.toContain('remote')
    const primary = [...base, node('remote', 'WebRemoteInput')]
    expect(ids(boardPartition(primary, baseEdges, 'board-2').nodes)).not.toContain('remote')
  })

  it('anchors a slideshow to both boards it shows on, with no link between them', () => {
    const nodes = [
      node('board-root', 'Board'), node('board-2', 'Board'),
      node('show', 'PatternSlideshow'), node('a', 'MatrixOutput'), node('b', 'MatrixOutput', on2),
    ]
    const edges = [edge('show', 'frame', 'a', 'frame'), edge('show', 'frame', 'b', 'frame')]
    expect(ids(boardPartition(nodes, edges, 'board-root').nodes)).toContain('show')
    expect(ids(boardPartition(nodes, edges, 'board-2').nodes)).toContain('show')
    expect(findCrossBoardIssues(nodes, edges)).toEqual([])
    expect(boardLinkSchema(nodes, edges).slots).toEqual([])
  })

  it('leaves a one-board project without link nodes', () => {
    const nodes = base.filter((n) => n.id !== 'board-2').map((n) => node(n.id, String(n.data.nodeType)))
    const edges = [...baseEdges, edge('enc', 'position', 'player', 'volume')]
    const part = boardPartition(nodes, edges, 'board-root')
    expect(ids(part.nodes)).toEqual(ids(nodes))
    expect(part.edges).toEqual(edges)
    expect(boardLinkSchema(nodes, edges)).toEqual({ slots: [], hash: 0 })
  })
})

describe('board links — presses and levels', () => {
  it('reads push switches and keys as presses, sensors as levels', () => {
    expect(isMomentaryBoolSource(node('b', 'ButtonInput'), 'pressed', [])).toBe(true)
    expect(isMomentaryBoolSource(node('e', 'EncoderInput'), 'pressed', [])).toBe(true)
    expect(isMomentaryBoolSource(node('m', 'MotionInput'), 'motion', [])).toBe(false)
    expect(isMomentaryBoolSource(node('t', 'TouchInput'), 'next', [])).toBe(true)
  })

  it('reads a Web Remote Button as a press and its Toggle as a level', () => {
    const remote = node('r', 'WebRemoteInput', {
      controls: [
        { id: 'go', type: 'Button', label: 'Go', properties: {} },
        { id: 'on', type: 'Toggle', label: 'On', properties: {} },
      ],
    })
    expect(isMomentaryBoolSource(remote, 'remote:go', [remote])).toBe(true)
    expect(isMomentaryBoolSource(remote, 'remote:on', [remote])).toBe(false)
  })

  it('reads a screen widget the panel can set as a level', () => {
    const touch = node('t', 'TouchInput')
    const panel = node('p', 'TransportDisplay', {}, { inputs: [{ id: 'widget:w2:set', dataType: 'bool' }] })
    expect(isMomentaryBoolSource(touch, 'widget:w1:out', [touch, panel])).toBe(true)
    expect(isMomentaryBoolSource(touch, 'widget:w2:out', [touch, panel])).toBe(false)
  })
})
