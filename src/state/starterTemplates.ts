import { NODE_LIBRARY, portColor } from './nodeLibrary'
import { resolveDefaultProperties } from './nodeDefaults'
import type { StudioNode, StudioEdge } from './graphStore'

export interface StarterTemplate {
  id: string
  name: string
  description: string
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
  {
    id: 'rainbow',
    name: 'Rainbow Sweep',
    description: 'A scrolling rainbow straight to the matrix — the simplest possible graph.',
    build: () => buildGraph(
      [
        { id: 'rainbow', type: 'Rainbow', col: 0 },
        { id: 'out', type: 'MatrixOutput', col: 1 },
      ],
      [
        { source: 'rainbow', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
      ],
    ),
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'The classic Fire2012 simulation feeding the matrix.',
    build: () => buildGraph(
      [
        { id: 'fire', type: 'Fire2012', col: 0 },
        { id: 'out', type: 'MatrixOutput', col: 1 },
      ],
      [
        { source: 'fire', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
      ],
    ),
  },
  {
    id: 'scrolling-text',
    name: 'Scrolling Text',
    description: 'A Text node with a scrolling marquee, ready to rename.',
    build: () => buildGraph(
      [
        { id: 'text', type: 'Text', col: 0, properties: { text: 'HELLO', scroll: 0.3, wrap: true } },
        { id: 'out', type: 'MatrixOutput', col: 1 },
      ],
      [
        { source: 'text', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
      ],
    ),
  },
  {
    id: 'audio-spectrum',
    name: 'Audio Spectrum',
    description: 'Microphone → FFT → Spectrum Bars — the standard audio-reactive starting point.',
    build: () => buildGraph(
      [
        { id: 'mic', type: 'MicInput', col: 0 },
        { id: 'fft', type: 'FFTAnalyzer', col: 1 },
        { id: 'bars', type: 'SpectrumBars', col: 2 },
        { id: 'out', type: 'MatrixOutput', col: 3 },
      ],
      [
        { source: 'mic', sourceHandle: 'audio', target: 'fft', targetHandle: 'audio' },
        { source: 'fft', sourceHandle: 'bass', target: 'bars', targetHandle: 'bass' },
        { source: 'fft', sourceHandle: 'mids', target: 'bars', targetHandle: 'mids' },
        { source: 'fft', sourceHandle: 'treble', target: 'bars', targetHandle: 'treble' },
        { source: 'bars', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
      ],
    ),
  },
  {
    id: 'field-warp',
    name: 'Field Warp Demo',
    description: 'Two noise fields push a third field around before it hits the matrix — the field pipeline in miniature.',
    build: () => buildGraph(
      [
        { id: 'base', type: 'FieldNoise', col: 0, row: 0, properties: { speed: 0.15, scale: 0.4 } },
        { id: 'dx', type: 'FieldNoise', col: 0, row: 1, properties: { speed: 0.2, scale: 0.8 } },
        { id: 'dy', type: 'FieldNoise', col: 0, row: 2, properties: { speed: 0.22, scale: 0.8 } },
        { id: 'warp', type: 'FieldWarp', col: 1, row: 1, properties: { strength: 1.5 } },
        { id: 'tofr', type: 'FieldToFrame', col: 2, row: 1 },
        { id: 'out', type: 'MatrixOutput', col: 3, row: 1 },
      ],
      [
        { source: 'base', sourceHandle: 'field', target: 'warp', targetHandle: 'field' },
        { source: 'dx', sourceHandle: 'field', target: 'warp', targetHandle: 'dx' },
        { source: 'dy', sourceHandle: 'field', target: 'warp', targetHandle: 'dy' },
        { source: 'warp', sourceHandle: 'field', target: 'tofr', targetHandle: 'field' },
        { source: 'tofr', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
      ],
    ),
  },
  {
    id: 'show-pipeline',
    name: 'Show Pipeline',
    description: 'A pre-wired skeleton for both show workflows: Library → Collection → Show Engine for the live preview, and Library → Performance → SD Card for a music-synced export.',
    build: () => buildGraph(
      [
        { id: 'lib', type: 'MusicLibrary', col: 0, row: 0 },
        { id: 'collection', type: 'PatternCollection', col: 1, row: 0 },
        { id: 'master', type: 'PatternMaster', col: 2, row: 0 },
        { id: 'out', type: 'MatrixOutput', col: 3, row: 0 },
        { id: 'perf', type: 'PerformanceGenerator', col: 1, row: 1 },
        { id: 'sd', type: 'SDCard', col: 2, row: 1 },
      ],
      [
        { source: 'collection', sourceHandle: 'patternset', target: 'master', targetHandle: 'patternset' },
        { source: 'master', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
        { source: 'lib', sourceHandle: 'music', target: 'perf', targetHandle: 'music' },
        { source: 'perf', sourceHandle: 'shows', target: 'sd', targetHandle: 'shows' },
      ],
    ),
  },
]
