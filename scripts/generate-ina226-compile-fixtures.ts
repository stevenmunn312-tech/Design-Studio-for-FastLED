/** Generate the sketches used by the INA226 power-monitor compile gate. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../src/state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const INA226 = { partId: 'ina226-current-sensor-module', sdaPin: 21, sclPin: 22, i2cAddress: '0x4A', overcurrentAmps: 10 }
const INA219 = { partId: 'adafruit-ina219-current-sensor', sdaPin: 21, sclPin: 22, i2cAddress: '0x40' }

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness']
  return result
}

/** Watts dim the output so codegen keeps every monitor. */
function sketch(monitors: Record<string, Record<string, unknown>>): string {
  const ids = Object.keys(monitors)
  const nodes = [
    ...ids.map((id) => node(id, 'PowerMonitorInput', monitors[id])),
    node('map', 'MapRange', { inMin: 0, inMax: 100, outMin: 1, outMax: 0.1, clamp: true }),
    node('fill', 'SolidColor', { r: 255, g: 200, b: 60 }), output(),
  ]
  const edges = [
    edge('watts', ids[0], 'watts', 'map', 'value'),
    edge('brightness', 'map', 'result', 'out', 'brightness'),
    edge('frame', 'fill', 'frame', 'out', 'frame'),
  ]
  // Every further monitor feeds a spare input so it is not pruned either.
  ids.slice(1).forEach((id, i) => edges.push(edge(`amps-${i}`, id, 'amps', 'fill', 'r')))
  return generateCpp(nodes, edges)
}

const fixtures = {
  ina226: sketch({ mon: INA226 }),
  both: sketch({ mon: INA219, mon226: { ...INA226, i2cAddress: '0x41' } }),
}

for (const [name, source] of Object.entries(fixtures)) {
  const count = (pattern: RegExp) => source.match(pattern)?.length ?? 0
  const found = [
    count(/static void _ina226Measure\(/g), count(/static void _ina219Measure\(/g), count(/Wire\.begin\(/g),
  ]
  const expected = name === 'both' ? [1, 1, 1] : [1, 0, 1]
  if (found.join() !== expected.join()) {
    throw new Error(`${name}: expected INA226/INA219 helpers and bus starts ${expected}, found ${found}`)
  }
  // The chips are driven through their registers over Wire: no library may be included.
  if (/#include <(INA226|INA219|Adafruit_INA219)/.test(source)) throw new Error(`${name}: unexpected library include`)
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/ina226-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} INA226 compile fixtures to ${outputDir}`)
