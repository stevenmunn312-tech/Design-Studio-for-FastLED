import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import { usePlayerTransport } from '../playerTransport'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category, properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

function outputsOf(nodes: StudioNode[], edges: StudioEdge[], nodeId: string, tick = 0) {
  return evaluateGraphFull(nodes, edges, tick, 8, 8).outputs.get(nodeId) ?? {}
}

describe('TransportControl status outputs', () => {
  beforeEach(() => {
    resetEvaluatorState()
    usePlayerTransport.setState({ transport: null, posMs: 0, playing: false, volume: 0.5 })
  })

  it('reads nothing when no transport is registered', () => {
    const out = outputsOf([node('tc', 'TransportControl', 'show')], [], 'tc')
    expect(out.title).toBe('')
    expect(out.playing).toBe(false)
    expect(out.duration).toBe(0)
    expect(out.progress).toBe(0)
  })

  it('publishes the live transport as wires a display can show', () => {
    usePlayerTransport.setState({
      transport: {
        nodeId: 'gen', title: 'Midnight Drive', durationMs: 200_000,
        hasPrev: true, hasNext: true, toggle: () => {}, seek: () => {}, prev: () => {}, next: () => {},
      },
      posMs: 50_000,
      playing: true,
      volume: 0.75,
    })
    const out = outputsOf([node('tc', 'TransportControl', 'show')], [], 'tc')
    expect(out.title).toBe('Midnight Drive')
    expect(out.elapsed).toBe(50)
    expect(out.duration).toBe(200)
    expect(out.progress).toBeCloseTo(0.25)
    expect(out.playing).toBe(true)
    expect(out.volumeOut).toBe(0.75)
  })

  it('publishes elapsed and duration as display text too', () => {
    usePlayerTransport.setState({
      transport: {
        nodeId: 'gen', title: 'T', durationMs: 200_000,
        hasPrev: false, hasNext: false, toggle: () => {}, seek: () => {}, prev: () => {}, next: () => {},
      },
      posMs: 65_000,
      playing: true,
      volume: 0.5,
    })
    const out = outputsOf([node('tc', 'TransportControl', 'show')], [], 'tc')
    expect(out.elapsedText).toBe('1:05')
    expect(out.durationText).toBe('3:20')
  })

  it('bounds the title to the shared display budget', () => {
    usePlayerTransport.setState({
      transport: {
        nodeId: 'gen', title: 'A'.repeat(300), durationMs: 1000,
        hasPrev: false, hasNext: false, toggle: () => {}, seek: () => {}, prev: () => {}, next: () => {},
      },
      posMs: 0, playing: false, volume: 0,
    })
    const out = outputsOf([node('tc', 'TransportControl', 'show')], [], 'tc')
    expect(String(out.title).length).toBeLessThan(70)
    expect(String(out.title).endsWith('...')).toBe(true)
  })
})

describe('TransportControl command bundle', () => {
  beforeEach(() => {
    resetEvaluatorState()
    usePlayerTransport.setState({ transport: null, posMs: 0, playing: false, volume: 0.5 })
  })

  it('publishes the same bundle shape Pattern Master already consumes', () => {
    const out = outputsOf([node('tc', 'TransportControl', 'show')], [], 'tc')
    const controls = out.controls as Record<string, unknown>
    expect(controls).toMatchObject({
      playPause: false, previous: false, next: false,
      volumeDelta: 0, ledToggle: false, brightnessDelta: 0,
    })
  })

  it('passes an absolute volume through', () => {
    const nodes = [node('pot', 'PotInput', 'input', { value: 0.4 }), node('tc', 'TransportControl', 'show')]
    const edges = [edge('e', 'pot', 'value', 'tc', 'volume')]
    const controls = outputsOf(nodes, edges, 'tc').controls as Record<string, unknown>
    expect(typeof controls.volume).toBe('number')
  })

  // A parked scrub must not publish a seek, or playback is dragged back to it
  // every frame.
  it('publishes no seek while the scrub is parked', () => {
    const nodes = [node('pot', 'PotInput', 'input', { value: 0.5 }), node('tc', 'TransportControl', 'show')]
    const edges = [edge('e', 'pot', 'value', 'tc', 'seek')]
    for (const tick of [0, 0.1, 0.2]) {
      const controls = outputsOf(nodes, edges, 'tc', tick) as Record<string, Record<string, unknown>>
      expect(controls.controls.seek).toBeUndefined()
    }
  })

  it('leaves seek absent entirely when nothing is wired to it', () => {
    const controls = outputsOf([node('tc', 'TransportControl', 'show')], [], 'tc').controls as Record<string, unknown>
    expect('seek' in controls).toBe(false)
  })

  it('carries an upstream bundle through so controls chain', () => {
    const nodes = [
      node('pc', 'PlayerControls', 'show', {}),
      node('tc', 'TransportControl', 'show'),
    ]
    const edges = [edge('e', 'pc', 'controls', 'tc', 'controlsIn')]
    const controls = outputsOf(nodes, edges, 'tc').controls as Record<string, unknown>
    expect(controls).toMatchObject({ playPause: false, previous: false, next: false })
  })
})

describe('TransportControl node contract', () => {
  it('produces the same bundle type Player Controls does', () => {
    const transport = NODE_LIBRARY.find((n) => n.type === 'TransportControl')!
    const player = NODE_LIBRARY.find((n) => n.type === 'PlayerControls')!
    const bundleOut = (def: typeof transport) => def.outputs.find((port) => port.dataType === 'playercontrols')
    expect(bundleOut(transport)?.id).toBe(bundleOut(player)?.id)
  })

  // Two bundle producers must agree on their command port names, or the same
  // button wired to each would mean different things.
  it('names its command inputs the same way Player Controls does', () => {
    const transport = NODE_LIBRARY.find((n) => n.type === 'TransportControl')!
    const player = NODE_LIBRARY.find((n) => n.type === 'PlayerControls')!
    const playerPorts = new Map(player.inputs.map((port) => [port.id, port.dataType]))
    for (const port of transport.inputs) {
      if (port.id === 'seek') continue
      expect(playerPorts.get(port.id), port.id).toBe(port.dataType)
    }
  })

  it('carries string outputs a display can consume directly', () => {
    const transport = NODE_LIBRARY.find((n) => n.type === 'TransportControl')!
    const strings = transport.outputs.filter((port) => port.dataType === 'string').map((port) => port.id)
    expect(strings).toEqual(['title', 'elapsedText', 'durationText', 'patternName'])
  })
})
