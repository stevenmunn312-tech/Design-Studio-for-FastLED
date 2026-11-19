import { describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraph } from '../../graphEvaluator'
import { NODE_LIBRARY, isPropertyEnabled } from '../../nodeLibrary'
import type { StudioEdge, StudioNode } from '../../graphStore'
import {
  NO_NETWORK_OUTPUT_HINT, NO_TRACK_OUTPUT_HINT, boardLedOutputs, ledSource, matchedLedProperties,
  resolveParticleTrack, resolveRippleNetwork,
} from '../ledOutputMatch'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'pattern', properties: { ...(def?.defaultProperties ?? {}), ...props },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const NETWORK_OUT = { form: 'strip', stripLayout: 'network', networkPreset: 'triangles', network: '', ledsPerEdge: 5, dataPin: 5 }
const RING_OUT = { form: 'ring', ledCount: 24, dataPin: 5 }
const STRIP_OUT = { form: 'strip', ledCount: 30, dataPin: 5 }
const MATRIX_OUT = { form: 'matrix', width: 8, height: 8, dataPin: 5 }

const edgesOf = (nodes: StudioNode[]) => [edge('e', nodes[0].id, 'frame', 'out', 'frame')]
// A fresh state key per call, and a run of frames, so each draw starts from nothing and has time to light.
let runs = 0
function frameOf(nodes: StudioNode[], frames = 90): string {
  const id = `${nodes[0].id}-${runs++}`
  const renamed = [{ ...nodes[0], id } as StudioNode, ...nodes.slice(1)]
  const edges = [edge('e', id, 'frame', 'out', 'frame')]
  let last = ''
  for (let tick = 0; tick <= frames; tick++) last = JSON.stringify(evaluateGraph(renamed, edges, tick, 16, 16))
  return last
}
const cppOf = (nodes: StudioNode[]) => generateCpp(nodes, edgesOf(nodes))

describe('Match LED output: the saved choice', () => {
  it('starts new nodes on Match and reads a node saved before the choice as Custom', () => {
    expect(node('a', 'NetworkRipple').data.properties).toMatchObject({ ledSource: 'match', ledsPerEdge: 4 })
    expect(node('b', 'StringParticles').data.properties).toMatchObject({ ledSource: 'match' })
    expect(ledSource(undefined)).toBe('custom')
    expect(ledSource('match')).toBe('match')
    expect(ledSource('anything else')).toBe('custom')
  })

  it('greys the node\'s own fields unless Custom', () => {
    const on = isPropertyEnabled
    expect(on('NetworkRipple', 'ledsPerEdge', { ledSource: 'match' })).toBe(false)
    expect(on('NetworkRipple', 'network', { ledSource: 'match', networkPreset: 'custom' })).toBe(false)
    expect(on('NetworkRipple', 'network', { ledSource: 'custom', networkPreset: 'custom' })).toBe(true)
    expect(on('NetworkRipple', 'networkPreset', {})).toBe(true)
    expect(on('StringParticles', 'ringLeds', { ledSource: 'match', track: 'ring' })).toBe(false)
    expect(on('StringParticles', 'ringLeds', { ledSource: 'custom', track: 'ring' })).toBe(true)
    expect(on('StringParticles', 'ringLeds', { ledSource: 'custom', track: 'row' })).toBe(false)
    expect(on('StringParticles', 'track', { ledSource: 'match' })).toBe(false)
  })
})

describe('Match LED output: which output fits', () => {
  it('takes the network from the first output with a Network layout', () => {
    const own = { ledSource: 'match', networkPreset: 'hexagons', ledsPerEdge: 4 }
    const result = resolveRippleNetwork(own, [STRIP_OUT, NETWORK_OUT, { ...NETWORK_OUT, ledsPerEdge: 9 }])
    expect(result).toMatchObject({ matched: true, hint: null, value: { networkPreset: 'triangles', ledsPerEdge: 5 } })
  })

  it('falls back to the node\'s own network, with a hint, when no output has one', () => {
    const own = { ledSource: 'match', networkPreset: 'hexagons', ledsPerEdge: 4 }
    for (const outputs of [[], [STRIP_OUT, RING_OUT, MATRIX_OUT]]) {
      expect(resolveRippleNetwork(own, outputs)).toEqual({ value: own, matched: false, hint: NO_NETWORK_OUTPUT_HINT })
    }
    const custom = resolveRippleNetwork({ ...own, ledSource: 'custom' }, [NETWORK_OUT])
    expect(custom.matched).toBe(false)
    expect(custom.hint).toBeNull()
  })

  it('gives a ring output the ring track at its LED count and a strip output the row', () => {
    const own = { ledSource: 'match', track: 'column', ringLeds: 60 }
    expect(resolveParticleTrack(own, [MATRIX_OUT, RING_OUT]).value).toMatchObject({ track: 'ring', ringLeds: 24 })
    expect(resolveParticleTrack(own, [STRIP_OUT]).value).toMatchObject({ track: 'row', ringLeds: 60 })
    // A network string is a strip: one row of its LEDs.
    expect(resolveParticleTrack(own, [NETWORK_OUT]).value).toMatchObject({ track: 'row' })
    // The first fitting output decides.
    expect(resolveParticleTrack(own, [STRIP_OUT, RING_OUT]).value).toMatchObject({ track: 'row' })
  })

  it('falls back, with a hint, when the only outputs are not a line', () => {
    const own = { ledSource: 'match', track: 'column', ringLeds: 60 }
    for (const outputs of [[], [MATRIX_OUT, { form: 'corkscrew', ledCount: 40 }, { form: 'hub75' }]]) {
      expect(resolveParticleTrack(own, outputs)).toEqual({ value: own, matched: false, hint: NO_TRACK_OUTPUT_HINT })
    }
  })

  it('leaves any other node type alone', () => {
    const props = { ledSource: 'match' }
    expect(matchedLedProperties('Rainbow', 'r', props, [node('o', 'MatrixOutput', RING_OUT)], []))
      .toEqual({ value: props, matched: false, hint: null })
  })
})

describe('Match LED output: the board partition', () => {
  it('matches only outputs on the node\'s own board', () => {
    const boards = [node('board-root', 'Board'), node('board-2', 'Board')]
    const first = node('o1', 'MatrixOutput', { ...RING_OUT, ledCount: 12 })
    const second = node('o2', 'MatrixOutput', { ...RING_OUT, ledCount: 40, boardId: 'board-2' })
    const onFirst = node('sp1', 'StringParticles', { ledSource: 'match' })
    const onSecond = node('sp2', 'StringParticles', { ledSource: 'match' })
    const nodes = [...boards, onFirst, onSecond, first, second]
    const edges = [edge('a', 'sp1', 'frame', 'o1', 'frame'), edge('b', 'sp2', 'frame', 'o2', 'frame')]
    expect(boardLedOutputs('sp1', nodes, edges).map((p) => p.ledCount)).toEqual([12])
    expect(boardLedOutputs('sp2', nodes, edges).map((p) => p.ledCount)).toEqual([40])
    expect(matchedLedProperties('StringParticles', 'sp2', onSecond.data.properties as Record<string, unknown>, nodes, edges).value)
      .toMatchObject({ track: 'ring', ringLeds: 40 })
    // A node no board's partition holds reads the primary board's outputs.
    expect(boardLedOutputs('in-a-group', nodes, edges).map((p) => p.ledCount)).toEqual([12])
  })
})

describe('Match LED output: preview and firmware agree', () => {
  const out = (props: Record<string, unknown>) => node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', colorOrder: 'GRB', ...props })

  it('draws a matched Ripple as a Custom one with the output\'s network, in the preview and the sketch', () => {
    const output = out(NETWORK_OUT)
    const common = { rate: 4, speed: 0.6, seed: 3, startNode: 0 }
    const matched = node('rp', 'NetworkRipple', { ...common, ledSource: 'match' })
    const custom = node('rp', 'NetworkRipple', { ...common, ledSource: 'custom', networkPreset: 'triangles', ledsPerEdge: 5 })
    const stale = node('rp', 'NetworkRipple', { ...common, ledSource: 'custom' })
    expect(frameOf([matched, output])).toBe(frameOf([custom, output]))
    expect(frameOf([matched, output])).not.toBe(frameOf([stale, output]))
    expect(cppOf([matched, output])).toBe(cppOf([custom, output]))
    expect(cppOf([matched, output])).toContain('// Ripple on a 18-edge network')
    expect(cppOf([matched, output])).toContain('static uint16_t _rp_rppx[90]')
  })

  it('follows a later change to the output', () => {
    const matched = node('rp', 'NetworkRipple', { rate: 4, speed: 0.6, seed: 3, startNode: 0 })
    expect(cppOf([matched, out({ ...NETWORK_OUT, ledsPerEdge: 5 })])).toContain('_rp_rppx[90]')
    expect(cppOf([matched, out({ ...NETWORK_OUT, ledsPerEdge: 8 })])).toContain('_rp_rppx[144]')
  })

  it('keeps the node\'s own network where no output has one', () => {
    const matched = node('rp', 'NetworkRipple', { ledSource: 'match', networkPreset: 'hexagons', ledsPerEdge: 4, rate: 4, seed: 3 })
    const custom = node('rp', 'NetworkRipple', { ledSource: 'custom', networkPreset: 'hexagons', ledsPerEdge: 4, rate: 4, seed: 3 })
    const output = out(RING_OUT)
    expect(frameOf([matched, output])).toBe(frameOf([custom, output]))
    expect(cppOf([matched, output])).toBe(cppOf([custom, output]))
  })

  it('reads an output\'s unreadable custom network JSON as the output does, as the hexagons, never into the sketch', () => {
    const output = out({ ...NETWORK_OUT, networkPreset: 'custom', network: '{"nodes":"); #define X' })
    const cpp = cppOf([node('rp', 'NetworkRipple', { ledSource: 'match', rate: 4 }), output])
    expect(cpp).toContain('// Ripple on a 19-edge network')
    expect(cpp).not.toContain('#define X')
  })

  it('rides a ring output as a Custom ring track of the same LED count', () => {
    const output = out(RING_OUT)
    const common = { mode: 'drift', count: 8, spawn: 0.9, seed: 5 }
    const matched = node('sp', 'StringParticles', { ...common, ledSource: 'match', track: 'column' })
    const custom = node('sp', 'StringParticles', { ...common, ledSource: 'custom', track: 'ring', ringLeds: 24 })
    expect(frameOf([matched, output])).toBe(frameOf([custom, output]))
    expect(cppOf([matched, output])).toBe(cppOf([custom, output]))
    expect(cppOf([matched, output])).toContain('_len=24;')
  })

  it('rides a strip output as the row whatever track the node saved', () => {
    const output = out(STRIP_OUT)
    const common = { mode: 'drift', count: 8, spawn: 0.9, seed: 5 }
    const matched = node('sp', 'StringParticles', { ...common, ledSource: 'match', track: 'ring', ringLeds: 40 })
    const custom = node('sp', 'StringParticles', { ...common, ledSource: 'custom', track: 'row' })
    expect(frameOf([matched, output])).toBe(frameOf([custom, output]))
    expect(cppOf([matched, output])).toBe(cppOf([custom, output]))
  })

  it('uses its own track on a matrix output, and when saved before the choice', () => {
    const props = { mode: 'drift', count: 8, spawn: 0.9, seed: 5, track: 'column' }
    const matched = node('sp', 'StringParticles', { ...props, ledSource: 'match' })
    const custom = node('sp', 'StringParticles', { ...props, ledSource: 'custom' })
    const legacy = node('sp', 'StringParticles', props)
    delete (legacy.data.properties as Record<string, unknown>).ledSource
    expect(frameOf([matched, out(MATRIX_OUT)])).toBe(frameOf([custom, out(MATRIX_OUT)]))
    expect(frameOf([legacy, out(RING_OUT)])).toBe(frameOf([custom, out(RING_OUT)]))
    expect(cppOf([legacy, out(RING_OUT)])).toBe(cppOf([custom, out(RING_OUT)]))
  })
})
