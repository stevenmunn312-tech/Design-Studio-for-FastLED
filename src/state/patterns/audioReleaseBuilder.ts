import type { StudioEdge, StudioNode } from '../graphStore'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { SavedPattern } from './patternLibrary'
import type { PatternFormTag } from './patternTags'
import { withEnergyDynamics } from './energyDynamics'

export type AudioReleaseSeed = Omit<SavedPattern, 'id' | 'createdAt' | 'categoryId' | 'bundled'>

const definitions = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))
const audioPorts = [{ id: 'param0', label: 'Audio', dataType: 'audio' }]
const framePorts = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]

/** Editable graphs share a musical control rig, not a flattened custom renderer. */
export class AudioReleaseBuilder {
  private nodes: StudioNode[] = []
  private edges: StudioEdge[] = []

  constructor(
    private name: string,
    private bestOn: PatternFormTag[],
    colors: readonly [string, string, string],
  ) {
    this.nodes.push({
      id: 'audio', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: 'Audio', nodeType: 'GroupInput', category: 'composite',
        properties: { paramId: 'param0' }, inputs: [],
        outputs: [{ id: 'out', label: 'Audio', dataType: 'audio' }] },
    } as StudioNode)
    this.node('features', 'AudioFeatures', { sensitivity: 0.55, gate: 0.025, smoothing: 0.7 })
    this.node('energy', 'Smooth', { response: 0.38 })
    this.wire('features', 'energy', 'energy', 'value')
    this.node('fft', 'FFTAnalyzer', { gain: 1.05, smoothing: 0.75, tilt: 0.08 })
    this.node('perc', 'PercussionDetect', { sensitivity: 0.58, decay: 0.72, separation: 0.55 })
    this.node('vibe', 'Vibe')
    this.node('song', 'SongStructure')
    this.node('beat', 'BeatDetect', { threshold: 0.4 })
    this.node('phase', 'BeatPhase')
    this.wire('beat', 'beat', 'phase', 'beat').wire('beat', 'bpm', 'phase', 'bpm')
    this.node('pitch', 'PitchDetect')
    this.node('stereo', 'StereoLevels')
    this.node('band', 'FrequencyBand', { lowHz: 1800, highHz: 6200, gain: 1.2, smoothing: 0.72 })
    for (const id of ['features', 'fft', 'perc', 'vibe', 'song', 'beat', 'pitch', 'stereo', 'band']) {
      this.wire('audio', 'out', id, 'audio')
    }
    this.node('buildup', 'Smooth', { response: 0.18 })
    this.wire('song', 'buildupProgress', 'buildup', 'value')
    this.node('dropAttack', 'Envelope', { attack: 0.035, decay: 1.65 })
    this.wire('song', 'drop', 'dropAttack', 'trigger')
    // Hold the impact at the event: the live detector may clear it next frame.
    this.node('dropImpactHold', 'SampleHold')
    this.wire('song', 'dropImpact', 'dropImpactHold', 'value').wire('song', 'drop', 'dropImpactHold', 'trigger')
    this.map('dropWeight', 'dropImpactHold', 'result', 0.45, 1)
    this.node('dropEnvelope', 'Math', { mathOp: 'multiply' })
    this.wire('dropAttack', 'result', 'dropEnvelope', 'a').wire('dropWeight', 'result', 'dropEnvelope', 'b')
    this.node('palette', 'Poline', { anchorA: colors[0], anchorB: colors[1], anchorC: colors[2], points: 7 })
    this.map('motion', 'energy', 'result', 0.07, 0.65)
    this.map('light', 'energy', 'result', 0.18, 0.85)
  }

  node(id: string, type: string, properties: Record<string, unknown> = {}): this {
    const definition = definitions.get(type)
    if (!definition) throw new Error(`Unknown release pattern node: ${type}`)
    if (this.nodes.some((node) => node.id === id)) throw new Error(`Duplicate release pattern node: ${id}`)
    this.nodes.push({
      id, type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: definition.label, nodeType: type, category: definition.category,
        properties: { ...definition.defaultProperties, ...properties },
        inputs: definition.inputs.map((port) => ({ ...port })),
        outputs: definition.outputs.map((port) => ({ ...port })) },
    } as StudioNode)
    return this
  }

  wire(source: string, sourceHandle: string, target: string, targetHandle: string): this {
    const from = this.nodes.find((node) => node.id === source)
    const to = this.nodes.find((node) => node.id === target)
    const output = (from?.data.outputs as SavedPattern['outputs'] | undefined)?.find((port) => port.id === sourceHandle)
    const input = (to?.data.inputs as SavedPattern['inputs'] | undefined)?.find((port) => port.id === targetHandle)
    if (!output || !input || output.dataType !== input.dataType) {
      throw new Error(`${this.name}: invalid wire ${source}.${sourceHandle} to ${target}.${targetHandle}`)
    }
    if (this.edges.some((edge) => edge.target === target && edge.targetHandle === targetHandle)) {
      throw new Error(`${this.name}: input already wired ${target}.${targetHandle}`)
    }
    this.edges.push({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`,
      source, sourceHandle, target, targetHandle, type: 'glowEdge', reconnectable: 'target' } as StudioEdge)
    return this
  }

  /** MapRange extrapolates, so clamp the source explicitly before mapping. */
  map(id: string, source: string, handle: string, outMin: number, outMax: number, inMin = 0, inMax = 1): string {
    this.node(`${id}Clamp`, 'Clamp', { min: Math.min(inMin, inMax), max: Math.max(inMin, inMax) })
    this.node(id, 'MapRange', { inMin, inMax, outMin, outMax })
    this.wire(source, handle, `${id}Clamp`, 'value').wire(`${id}Clamp`, 'result', id, 'value')
    return id
  }

  finish(frameNode: string, frameHandle = 'frame'): AudioReleaseSeed {
    this.map('dropLight', 'dropEnvelope', 'result', 0, 0.14)
    this.node('exposure', 'Math', { mathOp: 'add' })
    this.wire('light', 'result', 'exposure', 'a').wire('dropLight', 'result', 'exposure', 'b')
    this.node('silenceGate', 'Switch', { b: 0 })
    this.wire('exposure', 'result', 'silenceGate', 'a').wire('features', 'silence', 'silenceGate', 'sel')
    this.node('exposureSmooth', 'Smooth', { response: 0.09 })
    this.wire('silenceGate', 'result', 'exposureSmooth', 'value')
    this.node('releaseBrightness', 'BrightnessMod')
    this.wire(frameNode, frameHandle, 'releaseBrightness', 'frame')
    this.wire('exposureSmooth', 'result', 'releaseBrightness', 'brightness')
    this.nodes.push({
      id: 'out', type: 'studioNode', position: { x: 0, y: 0 },
      data: { label: 'Group Output', nodeType: 'GroupOutput', category: 'output',
        properties: {}, inputs: framePorts.map((port) => ({ ...port })), outputs: [] },
    } as StudioNode)
    this.wire('releaseBrightness', 'frame', 'out', 'frame')

    // Unused detectors never enter the saved graph or cost runtime work.
    const needed = new Set(['out'])
    const pending = ['out']
    while (pending.length) {
      const target = pending.pop()!
      for (const edge of this.edges) {
        if (edge.target !== target || needed.has(edge.source)) continue
        needed.add(edge.source)
        pending.push(edge.source)
      }
    }
    const nodes = this.nodes.filter((node) => needed.has(node.id))
    const edges = this.edges.filter((edge) => needed.has(edge.source) && needed.has(edge.target))
    // Topological columns keep the authored graph readable when opened.
    const depth = new Map<string, number>()
    const level = (id: string, visiting = new Set<string>()): number => {
      if (depth.has(id)) return depth.get(id)!
      if (visiting.has(id)) throw new Error(`${this.name}: cycle at ${id}`)
      const next = new Set(visiting).add(id)
      const parents = edges.filter((edge) => edge.target === id).map((edge) => level(edge.source, next))
      const result = parents.length ? Math.max(...parents) + 1 : 0
      depth.set(id, result)
      return result
    }
    const rows = new Map<number, number>()
    for (const node of nodes) {
      const column = level(node.id)
      const row = rows.get(column) ?? 0
      node.position = { x: column * 320, y: row * 420 }
      rows.set(column, row + 1)
    }
    // The shared colour lift sits after the scene's own exposure,
    // which already rests low and fades to black in silence.
    return withEnergyDynamics({ name: this.name, bestOn: this.bestOn,
      inputs: audioPorts.map((port) => ({ ...port })), outputs: framePorts.map((port) => ({ ...port })),
      subgraph: { nodes, edges } }, { lightFloor: 1 })
  }
}
