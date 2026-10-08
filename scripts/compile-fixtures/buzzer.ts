/** Generate the sketches used by the KY-012 and KY-006 buzzer compile gates. */
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

// A button held down sounds the buzzer; a solid colour keeps the LED output alive.
const buzzer = generateCpp([
  node('btn', 'ButtonInput', { pin: 4 }),
  node('buzz', 'BuzzerOutput', { partId: 'ky-012-active-buzzer-module', sigPin: 26 }),
  node('fill', 'SolidColor', { r: 255, g: 200, b: 60 }),
  node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
], [
  edge('sound', 'btn', 'pressed', 'buzz', 'on'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
])

// The KY-006: a held button sounds it, and a potentiometer sets the pitch from
// 200 Hz to 4 kHz through a Map Range.
function passiveBuzzer(pins: { button: number; pot: number; buzzer: number; led: number }, extra: StudioNode[] = [], extraEdges: StudioEdge[] = []) {
  return generateCpp([
    node('btn', 'ButtonInput', { pin: pins.button }),
    node('pot', 'PotInput', { pin: pins.pot }),
    node('map', 'MapRange', { inMin: 0, inMax: 1, outMin: 200, outMax: 4000 }),
    node('buzz', 'BuzzerOutput', { partId: 'ky-006-passive-buzzer-module', sigPin: pins.buzzer }),
    node('fill', 'SolidColor', { r: 255, g: 200, b: 60 }),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: pins.led }),
    ...extra,
  ], [
    edge('sound', 'btn', 'pressed', 'buzz', 'on'),
    edge('knob', 'pot', 'value', 'map', 'value'),
    edge('pitch', 'map', 'result', 'buzz', 'pitch'),
    edge('frame', 'fill', 'frame', 'out', 'frame'),
    ...extraEdges,
  ])
}

const irButtons = [{ id: 'power', label: 'Power', protocol: 'NEC', address: 0, command: 69, repeat: 'once' }]
// Classic ESP32 pins, and UNO pins for the AVR legs. The IR leg puts IRremote's
// receive timer beside tone()'s on the same board.
const buzzerPassive = passiveBuzzer({ button: 4, pot: 34, buzzer: 26, led: 5 })
const buzzerPassiveUno = passiveBuzzer({ button: 4, pot: 14, buzzer: 8, led: 6 })
const buzzerPassiveIrUno = passiveBuzzer(
  { button: 4, pot: 14, buzzer: 8, led: 6 },
  [node('ir', 'IRRemoteInput', { pin: 2, buttons: irButtons }), node('toggle', 'Trigger', { triggerOp: 'toggle', initialState: true })],
  [edge('ir-power', 'ir', 'button-power', 'toggle', 'trigger'), edge('ir-enabled', 'toggle', 'out', 'out', 'enabled')],
)

const writes = (source: string, pin: number) => source.match(new RegExp(`digitalWrite\\(${pin}, [^;]+ \\? HIGH : LOW\\);`, 'g'))?.length ?? 0
const count = (source: string, text: string) => source.split(text).length - 1

const active = { buzzer }
const passive = {
  'buzzer-passive': { source: buzzerPassive, pin: 26 },
  'buzzer-passive-uno': { source: buzzerPassiveUno, pin: 8 },
  'buzzer-passive-ir-uno': { source: buzzerPassiveIrUno, pin: 8 },
}
for (const [name, source] of Object.entries(active)) {
  const found = [writes(source, 26), count(source, 'digitalWrite(26, LOW);'), count(source, 'pinMode(26, OUTPUT);')]
  if (found.join() !== '1,1,1') {
    throw new Error(`${name}: expected one buzzer write, silent latch and output mode, found ${found.join('/')}`)
  }
}
for (const [name, { source, pin }] of Object.entries(passive)) {
  const found = [
    count(source, `digitalWrite(${pin}, LOW);`), count(source, `pinMode(${pin}, OUTPUT);`),
    count(source, `tone(${pin}, _bzWant);`), count(source, `noTone(${pin});`), writes(source, pin),
  ]
  if (found.join() !== '1,1,1,1,0') {
    throw new Error(`${name}: expected one silent latch, output mode, tone and noTone and no level write, found ${found.join('/')}`)
  }
}
const fixtures: Record<string, string> = {
  ...active, ...Object.fromEntries(Object.entries(passive).map(([name, { source }]) => [name, source])),
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/buzzer-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} buzzer compile fixtures to ${outputDir}`)
