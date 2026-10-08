/** Generate the normal-sketch gate for the Noctua NF-A4x10 5V PWM fan. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'

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

const source = generateCpp([
  node('pot', 'PotInput', { pin: 34 }),
  node('fan', 'CoolingFanOutput', { partId: 'noctua-nf-a4x10-5v-pwm', pwmPin: 25, tachPin: 26 }),
  node('map', 'MapRange', { inMin: 0, inMax: 5000, outMin: 0, outMax: 1, clamp: true }),
  node('gauge', 'Gauge', { palette: 'heat' }),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
], [
  edge('speed', 'pot', 'value', 'fan', 'speed'),
  edge('rpm', 'fan', 'rpm', 'map', 'value'),
  edge('level', 'map', 'result', 'gauge', 'value'),
  edge('frame', 'gauge', 'frame', 'out', 'frame'),
])

for (const expected of [
  'ledcAttach(25, 25000, 8);',
  'attachInterrupt(digitalPinToInterrupt(26), _fanTach_fan, FALLING);',
  '_fanCount_fan * 60000.0f) / (_fanElapsed_fan * 2.0f)',
  'float n_fan_rpm = _fanRpm_fan;',
]) {
  if (!source.includes(expected)) throw new Error(`cooling-fan: missing ${expected}`)
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/cooling-fan-fixtures')
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, 'cooling-fan.ino'), source, 'utf8')
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify({
  'cooling-fan': {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
  },
}, null, 2)}\n`, 'utf8')
console.log(`wrote cooling fan compile fixture to ${outputDir}`)
