// Node-share bench (HW-32 step 8 and 11): every frame and field source in the
// node library, in a handful of sketches with telemetry on and the `top` key
// widened from three nodes to every timed node. Each sketch drives a 16x16
// matrix, so a short strip on the data pin is enough: the render is timed,
// not the wire. Sources are blended into one chain, effects chained after a
// Plasma, field sources each mapped through Field to Frame.
//
//   node scripts/run-ts.mjs scripts/bench/node-shares.ts [profileId] [dataPin] [outputDir]
//   python scripts/bench/node-shares.py <sketch> <port> [fqbn] [seconds]
//
// Defaults: the LOLIN D1 mini (ESP8266), GPIO2 (D4), artifacts/bench/node-shares.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { findDeployBlockingErrors } from '../../src/utils/validateGraph'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import { resolveDefaultProperties } from '../../src/state/nodeDefaults'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'

const def = (type: string) => NODE_LIBRARY.find((d) => d.type === type)!
function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const d = def(nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: `${nodeType}`, nodeType, category: d.category,
      properties: resolveDefaultProperties(nodeType, { ...libraryDefaults(nodeType), ...properties }),
      inputs: d.inputs, outputs: d.outputs,
    },
  } as StudioNode
}
const edge = (source: string, sh: string, target: string, th: string) =>
  ({ id: `${source}-${sh}-${target}-${th}`, source, sourceHandle: sh, target, targetHandle: th }) as StudioEdge
const outOf = (type: string, dataType: string) => def(type).outputs.find((o) => o.dataType === dataType)!.id

const SKIP = new Set(['SDVideo', 'Image', 'DdpInput', 'ClockDisplay', 'Code', 'SpectrumVisualizer', 'Waveform',
  'SolidColor', 'PatternMaster', 'PatternSlideshow', 'PerformanceGenerator', 'Sequencer', 'Transition', 'FieldToFrame'])
const generators = NODE_LIBRARY.filter((d) => d.outputs.some((o) => o.dataType === 'frame')
  && !d.inputs.some((i) => i.dataType === 'frame' && i.id !== 'base') && !SKIP.has(d.type)).map((d) => d.type)
const effects = NODE_LIBRARY.filter((d) => d.category === 'composite' && d.inputs.some((i) => i.id === 'frame')
  && !d.inputs.some((i) => i.dataType === 'frame' && i.id !== 'frame')).map((d) => d.type)
const fieldSources = NODE_LIBRARY.filter((d) => d.category === 'field' && d.outputs.some((o) => o.dataType === 'field')
  && !d.inputs.some((i) => i.dataType === 'field' || i.dataType === 'frame')).map((d) => d.type)
const fieldEffects = NODE_LIBRARY.filter((d) => d.category === 'field' && d.inputs.some((i) => i.id === 'field') && d.outputs.some((o) => o.dataType === 'field')).map((d) => d.type)

const [profileId = 'esp8266-lolin-d1-mini', dataPin = '2', outputDir = 'artifacts/bench/node-shares'] = process.argv.slice(2)

function sketch(name: string, build: (nodes: StudioNode[], edges: StudioEdge[]) => string): void {
  const nodes: StudioNode[] = [
    node('board', 'Board', { profileId, reportTelemetry: true }),
    node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: Number(dataPin), chipset: 'WS2812B', colorOrder: 'GRB' }),
  ]
  const edges: StudioEdge[] = []
  const last = build(nodes, edges)
  edges.push(edge(last, 'frame', 'out', 'frame'))
  const errors = findDeployBlockingErrors(nodes, edges)
  if (errors.length) { console.log(`${name}: BLOCKED ${errors.join('; ')}`); return }
  let cpp = generateCpp(nodes, edges)
  const timed = /\/\/ FLS_STAT nodes \[(.*)\]/.exec(cpp)?.[1].split(',').length ?? 0
  cpp = cpp.replace(/topNodes\[3\] = \{-1, -1, -1\}/, `topNodes[${timed}]; for (int i = 0; i < ${timed}; i++) topNodes[i] = -1`)
    .replace(/place < 3/g, `place < ${timed}`).replace(/later = 2;/, `later = ${timed - 1};`)
  const dir = resolve(outputDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, `${name}.ino`), cpp)
  console.log(`${name}: ${timed} timed nodes`)
}

// Blend a list of frame sources into one chain; returns the last node id.
function blendAll(ids: string[], nodes: StudioNode[], edges: StudioEdge[]): string {
  let acc = ids[0]
  ids.slice(1).forEach((id, i) => {
    const b = `blend${i}`
    nodes.push(node(b, 'Blend', { amount: 0.5 }))
    edges.push(edge(acc, 'frame', b, 'a'), edge(id, 'frame', b, 'b'))
    acc = b
  })
  return acc
}

const chunk = 12
for (let i = 0; i < generators.length; i += chunk) {
  const group = generators.slice(i, i + chunk)
  sketch(`gen${i / chunk}`, (nodes, edges) => {
    group.forEach((t) => nodes.push(node(`g_${t}`, t)))
    return blendAll(group.map((t) => `g_${t}`), nodes, edges)
  })
}
sketch('effects', (nodes, edges) => {
  nodes.push(node('src', 'Plasma'))
  let prev = 'src'
  for (const t of effects) { nodes.push(node(`e_${t}`, t)); edges.push(edge(prev, 'frame', `e_${t}`, 'frame')); prev = `e_${t}` }
  return prev
})
sketch('fields', (nodes, edges) => {
  const frames = fieldSources.map((t) => {
    nodes.push(node(`f_${t}`, t), node(`ff_${t}`, 'FieldToFrame'))
    edges.push(edge(`f_${t}`, outOf(t, 'field'), `ff_${t}`, 'field'))
    return `ff_${t}`
  })
  return blendAll(frames, nodes, edges)
})
sketch('field-effects', (nodes, edges) => {
  nodes.push(node('fsrc', 'GradientField'))
  let prev = 'fsrc'
  for (const t of fieldEffects) { nodes.push(node(`fe_${t}`, t)); edges.push(edge(prev, outOf(def(prev === 'fsrc' ? 'GradientField' : prev.slice(3)).type, 'field'), `fe_${t}`, 'field')); prev = `fe_${t}` }
  nodes.push(node('fout', 'FieldToFrame'))
  edges.push(edge(prev, outOf(prev.slice(3), 'field'), 'fout', 'field'))
  return 'fout'
})
console.log({ generators: generators.length, effects: effects.length, fieldSources: fieldSources.length, fieldEffects: fieldEffects.length })
