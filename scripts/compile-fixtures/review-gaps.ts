/**
 * Generate the sketches the 2026-11-26 firmware review found no compile leg
 * for: code a board could be sent that nothing had ever built.
 *
 * - `chipsets-*`: every LED chipset form `fastledSetupCpp` writes that the
 *   other fixtures leave at WS2812B: an RGBW tail, the 16-bit and RGBCW
 *   parts, a clocked part with a data rate, and the same lines after the
 *   Board's LED driver has rebuilt them.
 * - `stream-receiver-*`: the Live Stream receiver, on a board of each kind of
 *   serial link it is offered on, and once with a fixed display.
 * - `hub75-s3`: the HUB75 library's ESP32-S3 branch.
 * - `line-in-s3`: the PCM1802 line input adapter.
 * - `sd-pin-probe`: the onboard-card pin probe.
 * - `show-i2c-pico`: a show with an I2C sensor on a board whose `Wire.begin`
 *   takes no pins. It failed to build before the review.
 *
 * Every graph is checked by the deploy gate for its board before it is
 * written, and the manifest names the board each one builds on.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { generateStreamReceiverSketch } from '../../src/codegen/sketches/streamReceiverGenerator'
import { CYD_SD_CANDIDATES, generateSdPinProbeSketch } from '../../src/codegen/sketches/sdPinProbeSketch'
import type { GroupRegistry } from '../../src/state/graphEvaluator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { findBoardPinCompatibility, findDeployBlockingErrors, findPinConflicts } from '../../src/utils/validateGraph'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  // A group's own output is not a library node.
  const definition = nodeType === 'GroupOutput'
    ? { label: 'Group Output', category: 'composite', inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }], outputs: [] }
    : NODE_LIBRARY.find((entry) => entry.type === nodeType)
  if (!definition) throw new Error(`no node type ${nodeType}`)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const CLASSIC = 'esp32:esp32:esp32'
const S3 = 'esp32:esp32:esp32s3'
const C6 = 'esp32:esp32:esp32c6'
const UNO = 'arduino:avr:uno'
const D1_MINI = 'esp8266:esp8266:d1_mini'
const PICO_W = 'rp2040:rp2040:rpipicow'
const R4_WIFI = 'arduino:renesas_uno:unor4wifi'

const board = (profileId: string, properties: Record<string, unknown> = {}) => node('board', 'Board', { profileId, ...properties })

interface Fixture { fqbn: string; source: string }
const fixtures: Record<string, Fixture> = {}

/** Refuse a graph the app would refuse: a fixture nobody could build proves nothing. */
function checked(name: string, fqbn: string, nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {}): void {
  const errors = [
    ...findPinConflicts(nodes, edges),
    ...findDeployBlockingErrors(nodes, edges, fqbn, undefined, groups),
    ...findBoardPinCompatibility(nodes, fqbn).errors,
  ]
  if (errors.length > 0) throw new Error(`${name}: the deploy gate refuses it: ${[...new Set(errors)].join('; ')}`)
}

// ── LED chipsets ────────────────────────────────────────────────────────────
interface Strip { chipset: string; pin: number; clock?: number; rate?: number }

function chipsets(name: string, fqbn: string, boardNode: StudioNode, strips: Strip[]): void {
  const outputs = strips.map((strip, index) => node(`o${index}`, 'MatrixOutput', {
    form: 'strip', ledCount: 8, dataPin: strip.pin, chipset: strip.chipset, colorOrder: 'GRB',
    ...(strip.clock !== undefined ? { clockPin: strip.clock } : {}),
    ...(strip.rate !== undefined ? { dataRateMhz: strip.rate } : {}),
  }))
  const nodes = [boardNode, node('fill', 'SolidColor', { r: 255, g: 80, b: 0 }), ...outputs]
  const edges = outputs.map((output) => edge('fill', 'frame', output.id, 'frame'))
  checked(name, fqbn, nodes, edges)
  fixtures[name] = { fqbn, source: generateCpp(nodes, edges) }
}

chipsets('chipsets-esp32', CLASSIC, board('esp32-generic-devkit-38pin'), [
  { chipset: 'SK6812-RGBW', pin: 4 }, { chipset: 'WS2816', pin: 13 }, { chipset: 'SM16824E', pin: 14 },
  { chipset: 'NEOPIXEL', pin: 16 }, { chipset: 'WS2815', pin: 17 },
  { chipset: 'APA102', pin: 23, clock: 18, rate: 12 }, { chipset: 'HD108', pin: 25, clock: 26, rate: 40 },
])
chipsets('chipsets-uno', UNO, board('arduino-uno-r3-dip'), [
  { chipset: 'SK6812-RGBW', pin: 2 }, { chipset: 'WS2816', pin: 3 }, { chipset: 'SM16824E', pin: 4 },
  { chipset: 'APA102', pin: 11, clock: 13, rate: 24 }, { chipset: 'HD108', pin: 5, clock: 6, rate: 40 },
])
// Through the Board's LED driver, which rebuilds each clockless line as a channel.
chipsets('chipsets-c6-rmt', C6, board('esp32-c6-devkitc-1', { ledDriver: 'RMT' }), [
  { chipset: 'SK6812-RGBW', pin: 4 }, { chipset: 'WS2811', pin: 5 }, { chipset: 'NEOPIXEL', pin: 6 },
  { chipset: 'SM16824E', pin: 7 }, { chipset: 'WS2816', pin: 10 },
])

// ── Live Stream receiver ────────────────────────────────────────────────────
for (const [name, fqbn, profileId, pin] of [
  ['stream-receiver-s3', S3, 'espressif-esp32-s3-devkitc-1', 5],
  ['stream-receiver-esp8266', D1_MINI, 'esp8266-lolin-d1-mini', 4],
  // A 16 MHz AVR: its own baud rate (1,000,000), since it cannot make 921600.
  ['stream-receiver-uno', UNO, 'arduino-uno-r3-dip', 6],
] as const) {
  const small = fqbn === UNO
  const nodes = [board(profileId), node('out', 'MatrixOutput', {
    form: 'matrix', width: small ? 8 : 16, height: small ? 8 : 16, dataPin: pin, serpentine: true,
  })]
  const source = generateStreamReceiverSketch(nodes, 'out')
  if (!source) throw new Error(`${name}: no receiver sketch`)
  fixtures[name] = { fqbn, source }
}

// With a fixed display, on an ArduinoCore-API board: the display's layout
// calls `max`, which is ambiguous there beside FastLED's unless qualified.
// It failed to build before the second review pass.
{
  const nodes = [board('arduino-uno-r4-wifi'),
    node('out', 'MatrixOutput', { form: 'matrix', width: 8, height: 8, dataPin: 6 }),
    node('oled', 'InfoDisplay', { partId: 'sh1106-oled-128x64-i2c' })]
  const source = generateStreamReceiverSketch(nodes, 'out')
  if (!source) throw new Error('stream-receiver-r4-oled: no receiver sketch')
  fixtures['stream-receiver-r4-oled'] = { fqbn: R4_WIFI, source }
}

// ── HUB75 on the S3 ─────────────────────────────────────────────────────────
{
  const nodes = [board('espressif-esp32-s3-devkitc-1'), node('rtc', 'RTCInput', { timeSource: 'Compile Time' }),
    node('text', 'Text', { text: 'BIG', size: 2, y: 0.25 }),
    node('clock', 'ClockDisplay', { displayMode: 'Digital HH:MM', size: 2, y: 0.75 }),
    node('out', 'MatrixOutput', { form: 'hub75', width: 64, height: 32 })]
  const edges = [edge('text', 'frame', 'clock', 'base'), edge('rtc', 'dateTime', 'clock', 'dateTime'), edge('clock', 'frame', 'out', 'frame')]
  checked('hub75-s3', S3, nodes, edges)
  fixtures['hub75-s3'] = { fqbn: S3, source: generateCpp(nodes, edges) }
}

// ── PCM1802 line input ──────────────────────────────────────────────────────
{
  const nodes = [board('generic-esp32-s3-n16r8-44pin-dual-usbc'),
    node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 }),
    node('line', 'LineInput', { i2sMclk: 14, i2sBclk: 15, i2sLrclk: 16, i2sDout: 17 }),
    node('pulse', 'BassPulse'), node('audio', 'Audio', { sourceId: 'line' })]
  const edges = [edge('audio', 'audio', 'pulse', 'audio'), edge('pulse', 'frame', 'out', 'frame')]
  checked('line-in-s3', S3, nodes, edges)
  fixtures['line-in-s3'] = { fqbn: S3, source: generateCpp(nodes, edges) }
}

// ── SD pin probe ────────────────────────────────────────────────────────────
// No graph: the probe is built from its candidate pin sets alone.
fixtures['sd-pin-probe'] = { fqbn: CLASSIC, source: generateSdPinProbeSketch({ candidates: CYD_SD_CANDIDATES, deselectPins: [15, 33] }) }

// ── A show with an I2C sensor, on a board whose Wire.begin takes no pins ────
{
  const groups = {
    pattern: {
      nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
      edges: [edge('fill', 'frame', 'end', 'frame')],
    },
  } as unknown as GroupRegistry
  const out = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 2 })
  out.data.exposedInputs = ['brightness']
  const nodes = [board('raspberry-pi-pico-w'),
    node('env', 'EnvironmentInput', { partId: 'adafruit-bme280-environment-sensor', sdaPin: 4, sclPin: 5, i2cAddress: '0x77' }),
    node('map', 'MapRange', { inMin: 0, inMax: 100, outMin: 0.1, outMax: 1, clamp: true }),
    node('control-map', 'ControlMap', { controls: ['brightness'] }),
    node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
    node('show', 'PatternSlideshow'), out]
  const edges = [edge('env', 'humidity', 'map', 'value'), edge('map', 'result', 'control-map', 'brightness'),
    edge('control-map', 'controls', 'show', 'controls'), edge('collection', 'patternset', 'show', 'patternset'),
    edge('show', 'frame', 'out', 'frame')]
  checked('show-i2c-pico', PICO_W, nodes, edges, groups)
  fixtures['show-i2c-pico'] = { fqbn: PICO_W, source: generateShowSketch(nodes, edges, groups) }
}

// What each sketch must contain to be the test it is named for.
const required: Record<string, string[]> = {
  'chipsets-esp32': ['.setRgbw(', 'WS2816', 'SM16824E', 'DATA_RATE_MHZ(12)', 'DATA_RATE_MHZ(40)'],
  'chipsets-uno': ['.setRgbw(', 'DATA_RATE_MHZ(24)'],
  'chipsets-c6-rmt': ['setExclusiveDriver', 'TypedChannel'],
  'stream-receiver-s3': ['Serial.begin(921600);'],
  'stream-receiver-uno': ['Serial.begin(1000000);'],
  'stream-receiver-r4-oled': ['_oledText(', 'fl::max('],
  'hub75-s3': ['MatrixPanel_I2S_DMA'],
  'line-in-s3': ['StudioPcm1802Input'],
  'sd-pin-probe': ['SD.begin('],
  'show-i2c-pico': ['Wire.begin();', '_bmeMeasure('],
}
for (const [name, symbols] of Object.entries(required)) {
  const missing = symbols.filter((symbol) => !fixtures[name].source.includes(symbol))
  if (missing.length) throw new Error(`${name}: missing ${missing.join(', ')}`)
}
if (/Wire\.begin\(\d/.test(fixtures['show-i2c-pico'].source)) throw new Error('show-i2c-pico: Wire.begin was given pins the RP2040 core does not take')

const outputDir = resolve(process.argv[2] ?? 'artifacts/review-gaps-compile')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { fqbn: string; bytes: number; sha256: string }> = {}
for (const [name, { fqbn, source }] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { fqbn, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} review-gap compile fixtures to ${outputDir}`)
