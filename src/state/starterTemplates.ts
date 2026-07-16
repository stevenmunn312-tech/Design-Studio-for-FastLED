import { NODE_LIBRARY, portColor } from './nodeLibrary'
import { resolveDefaultProperties } from './nodeDefaults'
import type { StudioNode, StudioEdge } from './graphStore'

export interface StarterTemplate {
  id: string
  name: string
  description: string
  completionSteps?: string[]
  preview: {
    nodes: Array<{ id: string; label: string; category: string; col: number; row: number }>
    edges: Array<{ source: string; sourceHandle: string; target: string; targetHandle: string; color: string }>
  }
  build: () => { nodes: StudioNode[]; edges: StudioEdge[] }
}

const LIBRARY_DEF = new Map(NODE_LIBRARY.map((d) => [d.type, d]))

// Horizontal chain layout — matches the spacing `spreadNodes` settles a fresh
// left-to-right graph into, so a template looks tidy without an explicit Tidy.
const COL_W = 260
const ROW_Y = 220

interface NodeSpec {
  /** Local id within the template — remapped to a fresh unique id on build(). */
  id: string
  type: string
  col: number
  row?: number
  properties?: Record<string, unknown>
}

interface EdgeSpec {
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

function template(
  options: Pick<StarterTemplate, 'id' | 'name' | 'description' | 'completionSteps'> & {
    nodeSpecs: NodeSpec[]
    edgeSpecs: EdgeSpec[]
  },
): StarterTemplate {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    completionSteps: options.completionSteps,
    preview: {
      nodes: options.nodeSpecs.map((spec) => {
        const def = LIBRARY_DEF.get(spec.type)
        if (!def) throw new Error(`Unknown template node type: ${spec.type}`)
        return {
          id: spec.id,
          label: def.label,
          category: def.category,
          col: spec.col,
          row: spec.row ?? 0,
        }
      }),
      edges: options.edgeSpecs.map((spec) => {
        const srcDef = LIBRARY_DEF.get(options.nodeSpecs.find((node) => node.id === spec.source)?.type ?? '')
        const srcPort = srcDef?.outputs.find((port) => port.id === spec.sourceHandle)
        return {
          source: spec.source,
          sourceHandle: spec.sourceHandle,
          target: spec.target,
          targetHandle: spec.targetHandle,
          color: portColor(srcPort?.dataType ?? 'float'),
        }
      }),
    },
    build: () => buildGraph(options.nodeSpecs, options.edgeSpecs),
  }
}

function buildGraph(nodeSpecs: NodeSpec[], edgeSpecs: EdgeSpec[]): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const uid = Date.now()
  const idFor = (localId: string) => `${localId}-${uid}`

  const nodes: StudioNode[] = nodeSpecs.map((spec) => {
    const def = LIBRARY_DEF.get(spec.type)
    if (!def) throw new Error(`Unknown template node type: ${spec.type}`)
    return {
      id: idFor(spec.id),
      type: 'studioNode',
      position: { x: spec.col * COL_W, y: ROW_Y + (spec.row ?? 0) * 180 },
      data: {
        label: def.label,
        nodeType: def.type,
        category: def.category,
        properties: { ...resolveDefaultProperties(def.type, def.defaultProperties), ...(spec.properties ?? {}) },
        inputs: def.inputs,
        outputs: def.outputs,
      },
    }
  })

  const nodeById = new Map(nodeSpecs.map((spec) => [spec.id, nodes.find((n) => n.id === idFor(spec.id))!]))

  const edges: StudioEdge[] = edgeSpecs.map((spec) => {
    const srcNode = nodeById.get(spec.source)
    const srcDef = srcNode ? LIBRARY_DEF.get(String(srcNode.data.nodeType)) : undefined
    const srcPort = srcDef?.outputs.find((p) => p.id === spec.sourceHandle)
    const stroke = portColor(srcPort?.dataType ?? 'float')
    return {
      id: `e-${idFor(spec.source)}-${idFor(spec.target)}-${spec.sourceHandle}-${spec.targetHandle}`,
      source: idFor(spec.source),
      sourceHandle: spec.sourceHandle,
      target: idFor(spec.target),
      targetHandle: spec.targetHandle,
      type: 'glowEdge',
      reconnectable: 'target',
      style: { stroke },
    } as StudioEdge
  })

  return { nodes, edges }
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  template({
    id: 'rainbow',
    name: 'Rainbow Sweep',
    description: 'A scrolling rainbow straight to the matrix — the simplest possible graph.',
    nodeSpecs: [
      { id: 'rainbow', type: 'Rainbow', col: 0 },
      { id: 'out', type: 'MatrixOutput', col: 1 },
    ],
    edgeSpecs: [
      { source: 'rainbow', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'fire',
    name: 'Fire',
    description: 'The classic Fire2012 simulation feeding the matrix.',
    nodeSpecs: [
      { id: 'fire', type: 'Fire2012', col: 0 },
      { id: 'out', type: 'MatrixOutput', col: 1 },
    ],
    edgeSpecs: [
      { source: 'fire', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'scrolling-text',
    name: 'Scrolling Text',
    description: 'A Text node with a scrolling marquee, ready to rename.',
    nodeSpecs: [
      { id: 'text', type: 'Text', col: 0, properties: { text: 'HELLO', scroll: 0.3, wrap: true } },
      { id: 'out', type: 'MatrixOutput', col: 1 },
    ],
    edgeSpecs: [
      { source: 'text', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'audio-spectrum',
    name: 'Audio Spectrum',
    description: 'Microphone → Spectrum Visualizer — full-band bars with held, falling peak dots.',
    nodeSpecs: [
      { id: 'mic', type: 'MicInput', col: 0 },
      { id: 'spectrum', type: 'SpectrumVisualizer', col: 1 },
      { id: 'out', type: 'MatrixOutput', col: 2 },
    ],
    edgeSpecs: [
      { source: 'mic', sourceHandle: 'audio', target: 'spectrum', targetHandle: 'audio' },
      { source: 'spectrum', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'field-warp',
    name: 'Field Warp Demo',
    description: 'Two noise fields push a third field around before it hits the matrix — the field pipeline in miniature.',
    nodeSpecs: [
      { id: 'base', type: 'FieldNoise', col: 0, row: 0, properties: { speed: 0.15, scale: 0.4 } },
      { id: 'dx', type: 'FieldNoise', col: 0, row: 1, properties: { speed: 0.2, scale: 0.8 } },
      { id: 'dy', type: 'FieldNoise', col: 0, row: 2, properties: { speed: 0.22, scale: 0.8 } },
      { id: 'warp', type: 'FieldWarp', col: 1, row: 1, properties: { strength: 1.5 } },
      { id: 'tofr', type: 'FieldToFrame', col: 2, row: 1 },
      { id: 'out', type: 'MatrixOutput', col: 3, row: 1 },
    ],
    edgeSpecs: [
      { source: 'base', sourceHandle: 'field', target: 'warp', targetHandle: 'field' },
      { source: 'dx', sourceHandle: 'field', target: 'warp', targetHandle: 'dx' },
      { source: 'dy', sourceHandle: 'field', target: 'warp', targetHandle: 'dy' },
      { source: 'warp', sourceHandle: 'field', target: 'tofr', targetHandle: 'field' },
      { source: 'tofr', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'generative-show',
    name: 'Generative Show',
    description: 'A focused live-show skeleton: Pattern Collection feeds the Show Engine, which performs straight into Matrix Output.',
    completionSteps: [
      'Group a finished pattern, then connect the Group frame output to Pattern Collection to absorb it.',
      'Tune Show Engine dwell and transition timing, then optionally wire a Transition Set.',
      'Upload the controller sketch from Matrix Output once the collection has patterns.',
    ],
    nodeSpecs: [
      { id: 'collection', type: 'PatternCollection', col: 0, row: 0 },
      { id: 'master', type: 'PatternMaster', col: 1, row: 0 },
      { id: 'out', type: 'MatrixOutput', col: 2, row: 0 },
    ],
    edgeSpecs: [
      { source: 'collection', sourceHandle: 'patternset', target: 'master', targetHandle: 'patternset' },
      { source: 'master', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ],
  }),
  template({
    id: 'music-sync-sd-show',
    name: 'Music-synced SD Show',
    description: 'A dedicated offline-show path: Music Library bakes timed show files through Performance Generator, then SD Card hands them to Matrix Output for provisioning.',
    completionSteps: [
      'Drop songs into Music Library and run analysis so Performance Generator has show files to export.',
      'Wire an optional Transition Set into Performance Generator if you want more transition variety.',
      'Use Upload show to SD from Matrix Output after choosing the board and port.',
    ],
    nodeSpecs: [
      { id: 'lib', type: 'MusicLibrary', col: 0, row: 0 },
      { id: 'perf', type: 'PerformanceGenerator', col: 1, row: 0 },
      { id: 'sd', type: 'SDCard', col: 2, row: 0 },
      { id: 'out', type: 'MatrixOutput', col: 3, row: 0 },
    ],
    edgeSpecs: [
      { source: 'lib', sourceHandle: 'music', target: 'perf', targetHandle: 'music' },
      { source: 'perf', sourceHandle: 'shows', target: 'sd', targetHandle: 'shows' },
      { source: 'sd', sourceHandle: 'sdcard', target: 'out', targetHandle: 'sdcard' },
    ],
  }),
]
