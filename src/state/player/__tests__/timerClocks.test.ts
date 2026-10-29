import { afterEach, describe, expect, it } from 'vitest'
import { evaluateGraphFull, getPatternShowSelection, resetEvaluatorState } from '../../graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { usePlayerTransport } from '../playerTransport'
import type { StudioNode, StudioEdge } from '../../graphStore'

function node(id: string, type: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === type)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: type, nodeType: type, category: definition?.category ?? 'graph',
    properties: { ...libraryDefaults(type), ...properties }, inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${target}`, source, sourceHandle, target, targetHandle })

afterEach(() => {
  resetEvaluatorState()
  usePlayerTransport.setState({ localTrack: null, transport: null, posMs: 0, playing: false })
})

describe('hardware timers ignore Master Speed', () => {
  it.each([
    ['Interval', { interval: 0.2 }, ''],
    ['Clock', { bpm: 120 }, ''],
    ['NoiseSignal', { speed: 0.5, seed: 7 }, ''],
    ['Envelope', { attack: 0.1, decay: 0.5 }, 'trigger'],
    ['Smooth', { response: 0.3 }, 'value'],
    ['Trigger', { triggerOp: 'oneShot', holdTime: 0.3 }, 'trigger'],
    ['Trigger', { triggerOp: 'delay', delayTime: 0.2 }, 'trigger'],
    ['Trigger', { triggerOp: 'debounce', stableTime: 0.1 }, 'trigger'],
    ['PaletteBank', { palettes: ['rainbow', 'ocean'], blend: 20 }, 'next'],
    ['GameOfLife', { seed: 7, speed: 8 }, ''],
    ['Automaton', { seed: 7, speed: 8 }, ''],
    ['ClockDisplay', { displayMode: 'Stopwatch', run: true }, ''],
    ['Gauge', { peakHold: 0.1 }, 'value'],
    ['ControlMap', {}, 'playPause'],
    ['Image', { animation: {
      frames: [{ w: 1, h: 1, pixels: [255, 0, 0] }, { w: 1, h: 1, pixels: [0, 0, 255] }],
      durations: [100, 200],
    } }, ''],
  ] as const)('%s uses elapsed time (%j)', (type, properties, input) => {
    const run = (speed: number) => {
      resetEvaluatorState()
      const timer = node('timer', type, properties)
      const source = node('source', 'Math', { mathOp: 'add', a: 0, b: 0 })
      const nodes = [source, timer]
      const edges = input ? [edge('source', 'result', 'timer', input)] : []
      return Array.from({ length: 101 }, (_, index) => {
        source.data.properties.a = index >= 10 && index < 40 ? 1 : 0
        const elapsedTick = index * 1.2 // 20 ms per pass.
        const { outputs } = evaluateGraphFull(nodes, edges, elapsedTick * speed, 8, 8, {}, true, true, '', null, elapsedTick)
        return structuredClone(outputs.get('timer'))
      })
    }
    const normal = run(1)
    expect(run(0)).toEqual(normal)
    expect(run(4)).toEqual(normal)
    expect(normal.some((value) => JSON.stringify(value) !== JSON.stringify(normal[0]))).toBe(true)
  })
})

describe('Music Player uses track position', () => {
  it('holds during pause, advances with the track, and restarts a hold after a backward seek', () => {
    const group = (blue: number) => ({ nodes: [node('solid', 'SolidColor', { r: 0, g: 0, b: blue }), node('go', 'GroupOutput')],
      edges: [edge('solid', 'frame', 'go', 'frame')] })
    const groups = { a: group(10), b: group(20) }
    const nodes = [node('pc', 'PatternCollection', { patternIds: ['a', 'b'] }),
      node('player', 'PatternMaster', { order: 'Sequential', minTime: 1, maxTime: 1, transitionSec: 0, beatTransitions: false }),
      node('out', 'MatrixOutput')]
    const edges = [edge('pc', 'patternset', 'player', 'patternset'), edge('player', 'frame', 'out', 'frame')]
    usePlayerTransport.setState({ localTrack: { title: 'Track', durationMs: 60_000 }, posMs: 0, playing: false })
    const step = (seconds: number, posMs: number) => {
      usePlayerTransport.setState({ posMs })
      evaluateGraphFull(nodes, edges, seconds * 240, 4, 4, groups, true, true, '', null, seconds * 60)
      return getPatternShowSelection('player')?.currentIndex
    }
    expect(step(0, 0)).toBe(0)
    expect(step(10, 0)).toBe(0)
    expect(step(11, 500)).toBe(0)
    step(12, 1100)
    expect(step(13, 1200)).toBe(1)
    expect(step(20, 1200)).toBe(1)
    expect(step(21, 100)).toBe(1)
    expect(step(22, 900)).toBe(1)
    step(23, 1200)
    expect(step(24, 1300)).toBe(0)
  })
})
