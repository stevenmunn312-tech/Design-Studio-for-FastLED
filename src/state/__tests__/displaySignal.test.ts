// One wire, three sources, and the panel each of them makes.
//
// The layout modules are covered in infoDisplay.test.ts and
// segmentDisplay.test.ts; what matters here is the routing: that every source
// publishes the envelope, that the envelope says the same thing as the ports
// beside it, and that a panel with nothing plugged in says so rather than
// sitting blank.

import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { DISPLAY_SOURCE_NODE_TYPES, isDisplaySignal, type DisplaySignal } from '../displaySignal'
import { infoLayoutForKind } from '../infoDisplay'
import { segmentModeForKind } from '../segmentDisplay'
import type { StudioNode, StudioEdge } from '../graphStore'
import type { SegmentFrame } from '../segmentDisplay'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const edge = (id: string, s: string, sh: string, t: string, th: string) =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge)

const IDS = ['grp-a', 'grp-b']
const GROUPS = Object.fromEntries(IDS.map((id, i) => [id, {
  nodes: [node('sc', 'SolidColor', { r: 0, g: 0, b: (i + 1) * 60 }), node('go', 'GroupOutput')],
  edges: [edge('eg', 'sc', 'frame', 'go', 'frame')],
}]))

/** Each source, wired to one OLED and one segment module. */
function graphFor(source: 'clock' | 'player' | 'slideshow') {
  const panels = [
    node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64' }),
    node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19 }),
  ]
  const wires = [
    edge('w1', 'src', 'display', 'oled', 'display'),
    edge('w2', 'src', 'display', 'seg', 'display'),
  ]
  if (source === 'clock') {
    return { nodes: [node('src', 'RTCInput', { timeSource: 'Compile Time' }), ...panels], edges: wires }
  }
  const type = source === 'player' ? 'PatternMaster' : 'PatternSlideshow'
  return {
    nodes: [
      node('coll', 'PatternCollection', { patternIds: IDS }),
      node('src', type, {}),
      node('out', 'MatrixOutput', {}),
      ...panels,
    ],
    edges: [
      edge('e1', 'coll', 'patternset', 'src', 'patternset'),
      edge('e2', 'src', 'frame', 'out', 'frame'),
      ...wires,
    ],
  }
}

function run(source: 'clock' | 'player' | 'slideshow') {
  const { nodes, edges } = graphFor(source)
  return evaluateGraphFull(nodes, edges, 30, 4, 4, GROUPS).outputs
}

describe('the display envelope', () => {
  beforeEach(() => resetEvaluatorState())

  it('is published by every source the model names', () => {
    // The map is what codegen and validation resolve a kind from without
    // evaluating anything, so it has to agree with what the nodes emit.
    for (const [nodeType, kind] of Object.entries(DISPLAY_SOURCE_NODE_TYPES)) {
      const source = ({ RTCInput: 'clock', PatternMaster: 'player', PatternSlideshow: 'slideshow' } as const)[
        nodeType as 'RTCInput' | 'PatternMaster' | 'PatternSlideshow'
      ]
      const signal = run(source).get('src')?.display
      expect(isDisplaySignal(signal), nodeType).toBe(true)
      expect((signal as DisplaySignal).kind, nodeType).toBe(kind)
    }
  })

  // The envelope is a second *view* of what the node already knows, never a
  // second computation of it: a panel and a custom UI reading the same player
  // must not be told different things.
  it('says the same thing as the ports beside it', () => {
    const outputs = run('player')
    const signal = outputs.get('src')?.display as DisplaySignal
    expect(signal.kind).toBe('player')
    if (signal.kind !== 'player') return
    expect(signal.song.title).toBe(outputs.get('src')?.title)
    expect(signal.song.playing).toBe(outputs.get('src')?.playing)
    expect(signal.song.elapsedSec).toBe(outputs.get('src')?.elapsed)
    expect(signal.song.durationSec).toBe(outputs.get('src')?.duration)
  })

  it('carries the selection a slideshow publishes on its own port', () => {
    const outputs = run('slideshow')
    const signal = outputs.get('src')?.display as DisplaySignal
    expect(signal.kind).toBe('slideshow')
    if (signal.kind !== 'slideshow') return
    expect(signal.selection).toEqual(outputs.get('src')?.patternSelect)
  })
})

describe('what a panel makes of it', () => {
  beforeEach(() => resetEvaluatorState())

  it.each(['clock', 'player', 'slideshow'] as const)('draws the %s screen', (source) => {
    const outputs = run(source)
    expect(outputs.get('oled')?.layout).toBe(infoLayoutForKind(source))
    // The segment module has no layout to report, so its mode is read from the
    // characters: only the clock and the elapsed track use the colon pair.
    const frame = outputs.get('seg')?.segment as SegmentFrame
    expect(frame.digits.length).toBe(4)
    expect(frame.digits.includes('-'), source).toBe(false)
    expect(segmentModeForKind(source)).not.toBe('Waiting')
  })

  // Unwired is a state, not a blank. A blank panel and a dead panel look
  // identical on a bench; unlit is a third thing again and looks different.
  it('says it is waiting with nothing plugged in', () => {
    const nodes = [
      node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64' }),
      node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display', clkPin: 18, dioPin: 19 }),
    ]
    const outputs = evaluateGraphFull(nodes, [], 30, 4, 4, {}).outputs
    expect(outputs.get('oled')?.layout).toBe('Waiting')
    expect(outputs.get('oled')?.lit).toBe(true)
    expect((outputs.get('seg')?.segment as SegmentFrame).digits).toBe('----')
    expect((outputs.get('seg')?.segment as SegmentFrame).lit).toBe(true)
  })

  it('is dark, not waiting, when the panel is disabled', () => {
    const nodes = [
      node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64', enabled: false }),
      node('seg', 'SegmentDisplay', { partId: 'tm1637-4digit-display', enabled: false }),
    ]
    const outputs = evaluateGraphFull(nodes, [], 30, 4, 4, {}).outputs
    expect(outputs.get('oled')?.lit).toBe(false)
    expect(outputs.get('oled')?.surface).toBeNull()
    expect((outputs.get('seg')?.segment as SegmentFrame).lit).toBe(false)
  })

  // Two sources can never fight over one panel, because there is one socket.
  it('has exactly one content input to plug into', () => {
    for (const type of ['InfoDisplay', 'SegmentDisplay']) {
      const def = NODE_LIBRARY.find((entry) => entry.type === type)!
      expect(def.inputs.filter((port) => port.dataType === 'display'), type).toHaveLength(1)
      expect(def.inputs.map((port) => port.id), type).toEqual(['display', 'enabled'])
    }
  })
})
