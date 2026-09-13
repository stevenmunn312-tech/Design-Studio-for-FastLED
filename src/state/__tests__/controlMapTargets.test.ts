// A control can be given a job that is not a player's.
//
// Everything the node offered acted on a track, a lamp or a collection, which
// is why it was called Player Controls. The rename is not cosmetic: the
// catalogue is a registry, and Master Speed is the first entry that proves it
// generalises — a row, a destination naming what acts on it, and the picker,
// the ports, the evaluator and the generators follow with nothing else taught.
//
// This asserts the whole path rather than the registry entry, because a row
// nobody honours is exactly the failure the registry shape is meant to prevent.

import { describe, it, expect } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { generateCpp } from '../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { PLAYER_CONTROL_FUNCTIONS, playerControlInputs, sensiblePlayerControls } from '../playerControlAssignments'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  const inputs = nodeType === 'ControlMap'
    ? playerControlInputs(properties.controls)
    : definition?.inputs ?? []
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs, outputs: definition?.outputs ?? [],
  } } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

/*
 * A control given the Master Speed job, reaching the clock.
 *
 * The source is a Math node rather than a knob because a Potentiometer in
 * preview reads live hardware state, which a test cannot set — the point here
 * is the routing, not where the number came from.
 */
function graph(controlValue: number, speedProperty = 1, assigned = ['masterSpeed']) {
  const wired = assigned.includes('masterSpeed')
  return {
    nodes: [
      node('board', 'Board'),
      node('knob', 'Math', { mathOp: 'add', a: controlValue, b: 0 }),
      node('map', 'ControlMap', { controls: assigned }),
      node('clock', 'MasterSpeed', { speed: speedProperty }),
      // Animated on purpose: the master clock is only emitted into a sketch
      // that reads `t`, and a solid colour never does.
      node('fill', 'Plasma'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
    ],
    edges: [
      ...(wired ? [edge('knob', 'result', 'map', 'masterSpeed')] : []),
      edge('map', 'controls', 'clock', 'controls'),
      edge('fill', 'frame', 'out', 'frame'),
    ],
  }
}

describe('a control given a job that is not a player\'s', () => {
  it('is offered on a chain that ends at Master Speed, and player jobs are not', () => {
    const offered = sensiblePlayerControls('float', [], { reachable: new Set(['speed' as const]) })
      .map((entry) => entry.id)
    expect(offered).toContain('masterSpeed')
    // Volume on a chain that reaches only the clock would wire, validate and
    // do nothing, which is the whole point of filtering by destination.
    expect(offered).not.toContain('volume')
  })

  it('mints a port the evaluator already reads', () => {
    const ports = playerControlInputs(['masterSpeed']).map((port) => port.id)
    expect(ports).toContain('masterSpeed')
    expect(PLAYER_CONTROL_FUNCTIONS.find((entry) => entry.id === 'masterSpeed')?.destinations)
      .toEqual(['speed'])
  })

  it('drives the clock from the knob instead of the node\'s own slider', () => {
    resetEvaluatorState()
    const { nodes, edges } = graph(0.75, 1)
    const speed = evaluateGraphFull(nodes, edges, 1, 8, 8).outputs.get('clock')?.speed
    expect(speed).toBeCloseTo(0.75, 5)
  })

  it('leaves the slider alone when the bundle carries no speed', () => {
    resetEvaluatorState()
    // The same chain, with nothing given the Master Speed job: the bundle
    // arrives carrying no speed and the node keeps its own setting.
    const { nodes, edges } = graph(0.75, 2, [])
    const speed = evaluateGraphFull(nodes, edges, 1, 8, 8).outputs.get('clock')?.speed
    expect(speed).toBeCloseTo(2, 5)
  })

  it('emits the same precedence into firmware', () => {
    const { nodes, edges } = graph(0.75, 1)
    const cpp = generateCpp(nodes, edges)
    expect(cpp).toContain('.hasSpeed = true;')
    // The clock reads the bundle when it carries a speed, and the node's own
    // value when it does not — the browser rule, in C++.
    expect(cpp).toMatch(/hasSpeed \? n_map_controls\.speed :/)
  })
})
