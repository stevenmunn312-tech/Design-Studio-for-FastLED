/** Generate real normal sketches used by the Power Switch dimming compile gate. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../src/state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

const PART = { partId: 'lr7843-mosfet-module' }

/** One LED output so every fixture is a whole, ordinary sketch. */
function leds(dataPin: number): [StudioNode, StudioNode, StudioEdge] {
  return [
    node('fill', 'SolidColor', { r: 255, g: 120, b: 20 }),
    node('out', 'MatrixOutput', { form: 'string', ledCount: 30, dataPin }),
    edge('frame', 'fill', 'frame', 'out', 'frame'),
  ]
}

function sketch(extra: StudioNode[], wires: StudioEdge[], dataPin = 5): string {
  const [fill, out, frame] = leds(dataPin)
  return generateCpp([...extra, fill, out], [...wires, frame])
}

// Classic ESP32: button on GPIO 12, pot on GPIO 34 (ADC1), switches on 25/26.
const button = () => node('btn', 'ButtonInput', { pin: 12 })
const pot = () => node('pot', 'PotInput', { pin: 34 })

const fixtures: Record<string, { source: string; pwm: number }> = {
  // Level at 1 and unwired: the switch must stay the on/off firmware it was.
  plain: {
    source: sketch([button(), node('sw', 'PowerSwitchOutput', { ...PART, signalPin: 25 })],
      [edge('on', 'btn', 'pressed', 'sw', 'on')]),
    pwm: 0,
  },
  'level-field': {
    source: sketch([button(), node('sw', 'PowerSwitchOutput', { ...PART, signalPin: 25, level: 0.4 })],
      [edge('on', 'btn', 'pressed', 'sw', 'on')]),
    pwm: 1,
  },
  'level-wired': {
    source: sketch([pot(), node('sw', 'PowerSwitchOutput', { ...PART, signalPin: 25 })],
      [edge('level', 'pot', 'value', 'sw', 'level')]),
    pwm: 1,
  },
  // Two dimmed switches: a second LEDC channel, one gated by On.
  gated: {
    source: sketch([
      button(), pot(),
      node('sw', 'PowerSwitchOutput', { ...PART, signalPin: 25 }),
      node('sw2', 'PowerSwitchOutput', { ...PART, signalPin: 26 }),
    ], [
      edge('on', 'btn', 'pressed', 'sw', 'on'),
      edge('level', 'pot', 'value', 'sw', 'level'),
      edge('level2', 'pot', 'value', 'sw2', 'level'),
    ]),
    pwm: 2,
  },
  // ESP8266 (NodeMCU): button D5 (14), pot A0 (17), switch D1 (5), LEDs D2 (4).
  'gated-esp8266': {
    source: sketch([
      node('btn', 'ButtonInput', { pin: 14 }),
      node('pot', 'PotInput', { pin: 17 }),
      node('sw', 'PowerSwitchOutput', { ...PART, signalPin: 5 }),
    ], [
      edge('on', 'btn', 'pressed', 'sw', 'on'),
      edge('level', 'pot', 'value', 'sw', 'level'),
    ], 4),
    pwm: 1,
  },
  // Raspberry Pi Pico: button GP14, pot GP26 (ADC0), switch GP15, LEDs GP2.
  'gated-rp2040': {
    source: sketch([
      node('btn', 'ButtonInput', { pin: 14 }),
      node('pot', 'PotInput', { pin: 26 }),
      node('sw', 'PowerSwitchOutput', { ...PART, signalPin: 15 }),
    ], [
      edge('on', 'btn', 'pressed', 'sw', 'on'),
      edge('level', 'pot', 'value', 'sw', 'level'),
    ], 2),
    pwm: 1,
  },
  // Arduino Uno: button D2, pot A0 (14), switch D9 (a timer PWM pin), LEDs D6.
  'gated-avr': {
    source: sketch([
      node('btn', 'ButtonInput', { pin: 2 }),
      node('pot', 'PotInput', { pin: 14 }),
      node('sw', 'PowerSwitchOutput', { ...PART, signalPin: 9 }),
    ], [
      edge('on', 'btn', 'pressed', 'sw', 'on'),
      edge('level', 'pot', 'value', 'sw', 'level'),
    ], 6),
    pwm: 1,
  },
}

for (const [name, { source, pwm }] of Object.entries(fixtures)) {
  const begins = source.match(/^ {2}flsPwmBegin\(/gm)?.length ?? 0
  const shims = source.match(/static void flsPwmBegin/g)?.length ?? 0
  if (begins !== pwm || shims !== (pwm > 0 ? 1 : 0)) {
    throw new Error(`${name}: expected ${pwm} dimmed switch(es) and ${pwm > 0 ? 1 : 0} shim, found ${begins}/${shims}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/power-switch-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string; dimmedSwitches: number }> = {}
for (const [name, { source, pwm }] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
    dimmedSwitches: pwm,
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} power-switch compile fixtures to ${outputDir}`)
