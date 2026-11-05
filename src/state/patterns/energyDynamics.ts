// The shared loudness stage every bundled audio pattern ends with: the frame
// sits subdued while the music is quiet, and as the energy rises it gains
// colour, then sparkle, then full brightness. One pure helper so the JSON
// shelves, the string recipes and the release builder shape loudness alike,
// and so a retune is one table rather than eighty-six graphs.
//
// Everything reads the smoothed `energy` of the pattern's own Audio Features
// node (added when a pattern has none), never a beat, so the response swells
// and settles instead of flashing. See the restrained-beat rule in
// docs/development/patterns/graph-and-nodes.md.
import type { StudioEdge, StudioNode } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { SavedPattern } from './patternLibrary'

export type EnergyDynamicsSeed = Omit<SavedPattern, 'id' | 'createdAt' | 'categoryId' | 'bundled'>

export interface EnergyDynamicsOptions {
  /** Brightness at rest, 0–1. The stage ramps it to 1 as the energy rises;
   *  1 means the pattern already shapes its own brightness and gets only the
   *  colour and sparkle. */
  lightFloor?: number
}

/** The response shared by every pattern. `energy` is Audio Features' 0–1
 *  output, which real music drives to roughly 0.05 at rest and 0.7 at full
 *  tilt; the ranges below are in those units. */
export const ENERGY_DYNAMICS = {
  /** Per-frame smoothing of the Audio Features node the stage adds when a
   *  pattern has none. Low, because the Smooth node below owns the response
   *  in wall-clock seconds and two slow smoothers stacked made the brightness
   *  swell about 0.6 s behind the music. */
  featureSmoothing: 0.6,
  /** Seconds the energy takes to follow a change (about 63% of a step). */
  smoothing: 0.15,
  lightIn: [0.06, 0.65] as const,
  lightFloor: 0.35,
  /** The colour lift starts as soon as the music has any energy. */
  boostIn: [0.2, 0.65] as const,
  boostMax: 0.3,
  /** Sparkle waits for the energetic half and is absent before it. */
  sparkleIn: [0.42, 0.72] as const,
  sparkleMax: 0.45,
  sparkle: { r: 255, g: 250, b: 240 },
}

const definitions = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))
const COLUMN = 300

function makeNode(id: string, type: string, position: { x: number; y: number }, properties: Record<string, unknown>): StudioNode {
  const definition = definitions.get(type)
  if (!definition) throw new Error(`Unknown energy dynamics node: ${type}`)
  return {
    id, type: 'studioNode', position,
    data: { label: definition.label, nodeType: type, category: definition.category,
      properties: { ...definition.defaultProperties, ...properties },
      inputs: definition.inputs.map((port) => ({ ...port })),
      outputs: definition.outputs.map((port) => ({ ...port })) },
  } as StudioNode
}

function makeEdge(source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle,
    type: 'glowEdge', reconnectable: 'target' } as StudioEdge
}

function nodeType(node: StudioNode): string {
  return String((node.data as { nodeType?: unknown }).nodeType ?? '')
}

/**
 * Append the energy stage to an audio pattern seed. The seed's own frame
 * chain is untouched: the stage takes the frame that fed Group Output and
 * hands Group Output the shaped one, laid out in the columns to its right.
 */
export function withEnergyDynamics(seed: EnergyDynamicsSeed, options: EnergyDynamicsOptions = {}): EnergyDynamicsSeed {
  const lightFloor = options.lightFloor ?? ENERGY_DYNAMICS.lightFloor
  const nodes = seed.subgraph.nodes.map((node) => ({ ...node, position: { ...node.position } })) as StudioNode[]
  const edges = [...seed.subgraph.edges]
  const taken = new Set(nodes.map((node) => node.id))
  const out = nodes.find((node) => nodeType(node) === 'GroupOutput')
  const outEdge = edges.find((edge) => edge.target === out?.id && edge.targetHandle === 'frame')
  if (!out || !outEdge) throw new Error(`${seed.name}: energy dynamics need a wired Group Output frame`)
  // A pattern may expose the audio more than once; any of them feeds the stage.
  const audioIns = new Set(nodes.filter((node) => nodeType(node) === 'GroupInput'
    && ((node.data as { outputs?: { dataType?: string }[] }).outputs ?? []).some((port) => port.dataType === 'audio')).map((node) => node.id))
  const audioIn = nodes.find((node) => audioIns.has(node.id))
  if (!audioIn) throw new Error(`${seed.name}: energy dynamics need an audio Group Input`)
  const audioEdge = edges.find((edge) => edge.source === audioIn.id)
  const audioHandle = audioEdge?.sourceHandle ?? 'out'

  const stage: StudioNode[] = []
  const added: StudioEdge[] = []
  const add = (id: string, type: string, column: number, row: number, properties: Record<string, unknown> = {}) => {
    if (taken.has(id)) throw new Error(`${seed.name}: node id ${id} is taken`)
    taken.add(id)
    stage.push(makeNode(id, type, { x: out.position.x + column * COLUMN, y: out.position.y + row * 220 }, properties))
    return id
  }
  const wire = (source: string, sourceHandle: string, target: string, targetHandle: string) => {
    added.push(makeEdge(source, sourceHandle, target, targetHandle))
  }
  // Clamp before Map Range, which extrapolates past its input range.
  const ramp = (id: string, column: number, row: number, [inMin, inMax]: readonly [number, number], outMin: number, outMax: number) => {
    add(`${id}Clamp`, 'Clamp', column, row, { min: inMin, max: inMax })
    add(id, 'MapRange', column + 1, row, { inMin, inMax, outMin, outMax })
    wire('dynEnergy', 'result', `${id}Clamp`, 'value')
    wire(`${id}Clamp`, 'result', id, 'value')
    return id
  }

  let features = nodes.find((node) => nodeType(node) === 'AudioFeatures'
    && edges.some((edge) => audioIns.has(edge.source) && edge.target === node.id))?.id
  if (!features) {
    features = add('dynFeatures', 'AudioFeatures', 0, 1, { sensitivity: 0.55, gate: 0.1, smoothing: ENERGY_DYNAMICS.featureSmoothing })
    wire(audioIn.id, audioHandle, features, 'audio')
  }
  add('dynEnergy', 'Smooth', 1, 1, { response: ENERGY_DYNAMICS.smoothing })
  wire(features, 'energy', 'dynEnergy', 'value')

  let tail = outEdge.source
  let tailHandle = outEdge.sourceHandle ?? 'frame'
  const shaped = (id: string, type: string, column: number, properties: Record<string, unknown> = {}) => {
    add(id, type, column, 0, properties)
    wire(tail, tailHandle, id, 'frame')
    tail = id
    tailHandle = 'frame'
  }

  ramp('dynBoost', 2, 1, ENERGY_DYNAMICS.boostIn, 0, ENERGY_DYNAMICS.boostMax)
  shaped('dynColor', 'ColorBoost', 4, { boost: 0 })
  wire('dynBoost', 'result', 'dynColor', 'boost')

  ramp('dynSparkle', 2, 2, ENERGY_DYNAMICS.sparkleIn, 0, ENERGY_DYNAMICS.sparkleMax)
  shaped('dynGlitter', 'Glitter', 5, { density: 0, glitterMode: 'add', ...ENERGY_DYNAMICS.sparkle, seed: 7 })
  wire('dynSparkle', 'result', 'dynGlitter', 'density')

  let columns = 6
  if (lightFloor < 1) {
    ramp('dynLight', 2, 3, ENERGY_DYNAMICS.lightIn, lightFloor, 1)
    shaped('dynBrightness', 'BrightnessMod', 6, { brightness: 1 })
    wire('dynLight', 'result', 'dynBrightness', 'brightness')
    columns = 7
  }

  out.position = { x: out.position.x + columns * COLUMN, y: out.position.y }
  const kept = edges.filter((edge) => edge !== outEdge)
  return {
    ...seed,
    subgraph: { nodes: [...nodes, ...stage], edges: [...kept, ...added, makeEdge(tail, tailHandle, out.id, 'frame')] },
  }
}
