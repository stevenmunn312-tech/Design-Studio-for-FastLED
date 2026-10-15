/**
 * Node-reference example graphs.
 *
 * The same spec drives the Help article image, the evaluated frame image,
 * and the "Try it live" insertion. Every graph is passed through the real
 * tidyLayout algorithm so the static image and inserted patch start from the
 * same clean, left-to-right dataflow layout.
 */
import type { LiveExampleSpec, LiveExampleNodeSpec } from '../../../utils/insertLiveExample'
import { libraryDefaults, NODE_LIBRARY, nodeDisplayLabel } from '../../../state/nodeLibrary'
import { tidyLayout } from '../../../utils/tidyLayout'
import type { NodeDefinition } from '../../../types'
import { LED_OUTPUT_FORM_LABELS, type LedOutputForm } from '../../../state/output/ledOutputForm'
import { irRemoteOutputs } from '../../../state/peripherals/irRemote'
import { buttonBankOutputs } from '../../../state/player/buttonBank'

export interface ReferenceLiveExample extends LiveExampleSpec {
  /** Compact topology shown beside the Try it live button. */
  path: string
  /** Node-specific explanation shown below the graph image. */
  explanation: string
  /** Expected outcome shown beside the evaluated frame preview. */
  previewDescription: string
  /** The LED output whose frame the reference renders. */
  previewTarget: { node: string; handle: string }
  /** Workflow nodes have an outcome card instead of a misleading black panel. */
  previewMode?: 'led' | 'workflow'
}

const definitionByType = new Map(NODE_LIBRARY.map((node) => [node.type, node]))

function definition(type: string): NodeDefinition {
  const found = definitionByType.get(type)
  if (!found) throw new Error(`Unknown help-example node type: ${type}`)
  return found
}

function estimatedNodeHeight(type: string): number {
  const node = definition(type)
  const primary = node.outputs[0]?.dataType
  const preview = primary === 'frame' ? 224 : primary === 'palette' || primary === 'color' ? 40 : 0
  const ports = Math.max(node.inputs.length, node.outputs.length) * 28
  const properties = Math.min(Object.keys(node.defaultProperties ?? {}).length, 10) * 21
  const embedded = ['MatrixOutput', 'MusicLibrary', 'PerformanceGenerator', 'PatternCollection'].includes(type) ? 150 : 0
  return Math.max(100, 56 + preview + ports + properties + embedded)
}

/** The title a node shows on the canvas: an LED output by its form, a mode node by its mode. */
export function canvasLabel(type: string, properties: Record<string, unknown> | undefined): string {
  return nodeDisplayLabel(type, { ...libraryDefaults(type), ...properties }, definition(type).label)
}

function graphPath(nodes: LiveExampleNodeSpec[]): string {
  const columns = new Map<number, string[]>()
  for (const node of [...nodes].sort((a, b) => a.dx - b.dx || a.dy - b.dy)) {
    const label = canvasLabel(node.type, node.properties)
    columns.set(node.dx, [...(columns.get(node.dx) ?? []), label])
  }
  return [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, labels]) => labels.join(' + '))
    .join(' → ')
}

/** Apply the app's Tidy Graph layout and centre the example on the insertion origin. */
function tidy(nodes: LiveExampleNodeSpec[], edges: LiveExampleSpec['edges']): LiveExampleNodeSpec[] {
  const initial = nodes.map((node, order) => ({
    id: node.key,
    x: 0,
    y: order * 120,
    width: 240,
    height: estimatedNodeHeight(node.type),
  }))
  const positions = tidyLayout(
    initial,
    edges.map((edge) => ({ source: edge.source, target: edge.target })),
    { gapX: 100, gapY: 60, grid: 20 },
  )
  const placed = nodes.map((node, order) => ({
    ...node,
    ...(positions.get(node.key) ?? { x: 0, y: order * 120 }),
  }))
  const minX = Math.min(...placed.map((node) => node.x))
  const maxX = Math.max(...placed.map((node) => node.x + 240))
  const minY = Math.min(...placed.map((node) => node.y))
  const maxY = Math.max(...placed.map((node) => node.y + estimatedNodeHeight(node.type)))
  const shiftX = Math.round(((minX + maxX) / 2) / 20) * 20
  const shiftY = Math.round(((minY + maxY) / 2) / 20) * 20
  return placed.map((node) => ({
    key: node.key,
    type: node.type,
    properties: node.properties,
    sourceProvider: node.sourceProvider,
    dx: node.x - shiftX,
    dy: node.y - shiftY,
  }))
}

/**
 * The outputs a placed node actually has.
 *
 * Most nodes declare theirs in `NODE_LIBRARY`, but some mint ports from their
 * own properties: an IR Remote or Button Bank grows one per configured key, so
 * the library definition declares only the trailing "add one" socket — an
 * invitation rather than a signal, which an example must never wire.
 */
function outputsOf(type: string, properties: Record<string, unknown> | undefined) {
  if (type === 'IRRemoteInput') return irRemoteOutputs(properties?.buttons)
  if (type === 'ButtonBank') return buttonBankOutputs(properties?.buttons, false)
  return definition(type).outputs
}

type NodeEntry = readonly [type: string, properties?: Record<string, unknown>]

export interface ExampleSpec {
  /** The node the article is about; used to check the example features it. */
  featured: string
  title: string
  /** Example nodes by key, in reading order. `MicInput`/`LineInput` become an Audio node with that provider. */
  nodes: Record<string, NodeEntry>
  /** Wires as `'source.handle > target.handle'`. */
  wires?: string[]
  /** LED output properties when the example does not place its own `MatrixOutput`. Defaults to a 16×16 matrix. */
  output?: Record<string, unknown>
  /** `key` or `key.handle` of the frame shown on the LED output, when it is not the last unconsumed frame. */
  show?: string
  explanation: string
  /** What the reader should see. `{output}` is replaced with the LED output's form label. */
  preview: string
  /** A show or hardware workflow whose outcome is not a picture. */
  workflow?: boolean
}

function parseEnd(end: string): { key: string; handle: string } {
  const dot = end.indexOf('.')
  if (dot < 1) throw new Error(`Malformed wire end: ${end}`)
  return { key: end.slice(0, dot).trim(), handle: end.slice(dot + 1).trim() }
}

/** Build one reference example and check every wire against the real ports. */
export function example(spec: ExampleSpec): ReferenceLiveExample {
  const nodes: LiveExampleNodeSpec[] = Object.entries(spec.nodes).map(([key, [type, properties]]) => {
    definition(type)
    if (type === 'MicInput' || type === 'LineInput') {
      return {
        key, type: 'Audio', dx: 0, dy: 0,
        properties: { sourceId: type === 'MicInput' ? '$microphone' : '$line-in' },
        sourceProvider: { type, properties },
      }
    }
    return { key, type, dx: 0, dy: 0, properties }
  })
  // Every example ends at one LED output: the example's own, or a default
  // one keyed `output` that wires may name before it exists.
  let output = nodes.find((node) => node.type === 'MatrixOutput')
  if (!output) {
    output = { key: 'output', type: 'MatrixOutput', dx: 0, dy: 0, properties: spec.output ?? MATRIX() }
    nodes.push(output)
  }
  const byKey = new Map(nodes.map((node) => [node.key, node]))
  const edges: LiveExampleSpec['edges'] = (spec.wires ?? []).map((wire) => {
    const [from, to] = wire.split('>')
    if (!to) throw new Error(`${spec.featured}: malformed wire ${wire}`)
    const source = parseEnd(from)
    const target = parseEnd(to)
    const sourceNode = byKey.get(source.key)
    const targetNode = byKey.get(target.key)
    if (!sourceNode || !targetNode) throw new Error(`${spec.featured}: unknown node in ${wire}`)
    if (!outputsOf(sourceNode.type, sourceNode.properties).some((port) => port.id === source.handle)) {
      throw new Error(`${spec.featured}: ${sourceNode.type}.${source.handle} is not an output`)
    }
    if (!definition(targetNode.type).inputs.some((port) => port.id === target.handle)) {
      throw new Error(`${spec.featured}: ${targetNode.type}.${target.handle} is not an input`)
    }
    return { source: source.key, sourceHandle: source.handle, target: target.key, targetHandle: target.handle }
  })

  if (!edges.some((edge) => edge.target === output.key && edge.targetHandle === 'frame')) {
    const shown = spec.show ? parseEnd(spec.show.includes('.') ? spec.show : `${spec.show}.frame`) : lastFreeFrame(nodes, edges, output.key)
    if (!shown) throw new Error(`${spec.featured}: nothing to show on the LED output`)
    edges.push({ source: shown.key, sourceHandle: shown.handle, target: output.key, targetHandle: 'frame' })
  }

  const form = String(output.properties?.form ?? 'matrix') as LedOutputForm
  const outputLabel = LED_OUTPUT_FORM_LABELS[form] ?? LED_OUTPUT_FORM_LABELS.matrix
  if (!spec.preview.includes('{output}')) throw new Error(`${spec.featured}: preview must name {output}`)
  const tidied = tidy(nodes, edges)
  return {
    title: spec.title,
    nodes: tidied,
    edges,
    explanation: spec.explanation,
    previewDescription: spec.preview.split('{output}').join(outputLabel),
    previewMode: spec.workflow ? 'workflow' : 'led',
    previewTarget: { node: output.key, handle: 'frame' },
    path: graphPath(tidied),
  }
}

function lastFreeFrame(
  nodes: LiveExampleNodeSpec[],
  edges: LiveExampleSpec['edges'],
  outputKey: string,
): { key: string; handle: string } | undefined {
  const candidates = nodes
    .filter((node) => node.key !== outputKey)
    .flatMap((node) => definition(node.type).outputs
      .filter((port) => port.dataType === 'frame')
      .map((port) => ({ key: node.key, handle: port.id })))
  return [...candidates].reverse().find((candidate) => !edges.some((edge) =>
    edge.source === candidate.key && edge.sourceHandle === candidate.handle))
}

/** A small 8×8 image so image examples carry their own picture. */
export const SAMPLE_IMAGE = (() => {
  const pixels: number[] = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const dx = Math.abs(x - 3.5)
      const dy = Math.abs(y - 3.5)
      const hot = (dy < 1 && dx < 3.5) || (dx < 1 && dy < 3.5) || (dx + dy < 4.5)
      pixels.push(...(hot ? [255, 45 + y * 20, 180 - x * 10] : [5, 10, 28]))
    }
  }
  return { w: 8, h: 8, pixels }
})()

/** Common LED outputs, so examples vary the form deliberately. */
export const STRIP = (ledCount = 60) => ({ form: 'strip', ledCount })
export const RING = (ledCount = 24) => ({ form: 'ring', ledCount, ringStartAngle: 0, ringDirection: 'cw' })
export const MATRIX = (width = 16, height = 16) => ({ form: 'matrix', width, height })
