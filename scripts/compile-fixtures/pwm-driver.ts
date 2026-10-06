/** Generate the sketches used by the PCA9685 PWM-driver compile gate. */
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

const DRIVER = { partId: 'adafruit-pca9685-pwm-driver', sdaPin: 21, sclPin: 22, i2cAddress: '0x41', pwmHz: 1000 }

function output(): StudioNode {
  return node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
}

/** A knob drives channels 0 and 15; a solid colour keeps the LED output alive. */
const driverNodes = () => [
  node('pwm', 'PwmDriverOutput', DRIVER), node('pot', 'PotInput', { pin: 34 }),
  node('fill', 'SolidColor', { r: 255, g: 200, b: 60 }), output(),
]
const driverEdges = () => [
  edge('c0', 'pot', 'value', 'pwm', 'channel0'),
  edge('c15', 'pot', 'value', 'pwm', 'channel15'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
]

// The same driver beside an INA226: two I2C parts, one bus, one Wire start.
const shared = generateCpp(
  [...driverNodes(), node('mon', 'PowerMonitorInput', {
    partId: 'ina226-current-sensor-module', sdaPin: 21, sclPin: 22, i2cAddress: '0x4A',
  })],
  [...driverEdges(), edge('watts', 'mon', 'watts', 'fill', 'r')],
)

const fixtures = { pwm: generateCpp(driverNodes(), driverEdges()), shared }

for (const [name, source] of Object.entries(fixtures)) {
  const count = (pattern: RegExp) => source.match(pattern)?.length ?? 0
  const found = [count(/static bool _pcaSet\(/g), count(/_pcaSet\(0x41, (0|15), /g), count(/Wire\.begin\(/g)]
  const expected = [1, 2, 1]
  if (found.join() !== expected.join()) {
    throw new Error(`${name}: expected PCA9685 helper, channel writes and bus starts ${expected}, found ${found}`)
  }
  const off = source.indexOf('_pcaWrite(addr, 0xFD, 0x10)')
  const sleep = source.indexOf('_pcaWrite(addr, 0x00, 0x10)')
  if (off < 0 || off >= sleep) throw new Error(`${name}: retained outputs must be turned off before sleep`)
  // The chip is driven through its registers over Wire: no library may be included.
  if (/#include <(Adafruit_PWMServoDriver|PCA9685)/.test(source)) throw new Error(`${name}: unexpected library include`)
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/pwm-driver-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} PWM-driver compile fixtures to ${outputDir}`)
