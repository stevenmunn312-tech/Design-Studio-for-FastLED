/** Generate real normal sketches used by the Power Switch compile gate: LR7843 dimming and the four-channel Mosfetti. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../src/codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import { partDerivedInputs } from '../src/state/partPorts'
import type { StudioEdge, StudioNode } from '../src/state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  const merged = { ...libraryDefaults(nodeType), ...properties }
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: definition?.category ?? 'output',
      properties: merged,
      inputs: partDerivedInputs(nodeType, merged.partId) ?? definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

const PART = { partId: 'lr7843-mosfet-module' }
const MOSFETTI = { partId: 'monkmakes-mosfetti' }

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

/** A Mosfetti on four pins, A to D. */
function mosfetti(pins: [number, number, number, number], properties: Record<string, unknown> = {}): StudioNode {
  const [signalPin, signal2Pin, signal3Pin, signal4Pin] = pins
  return node('mf', 'PowerSwitchOutput', { ...MOSFETTI, signalPin, signal2Pin, signal3Pin, signal4Pin, ...properties })
}

/**
 * An LR7843 dimmed at 500 Hz beside a Mosfetti with two channels dimmed at
 * 1 kHz: on ESP32 core 2 the 1 kHz pair must start on LEDC channel 2, away
 * from the LR7843's timer; ESP8266 and RP2040 run every pin at 500 Hz.
 */
function mixed(buttonPin: number, potPin: number, lrPin: number, mfPins: [number, number, number, number], dataPin: number) {
  return sketch([
    node('btn', 'ButtonInput', { pin: buttonPin }),
    node('pot', 'PotInput', { pin: potPin }),
    node('sw', 'PowerSwitchOutput', { ...PART, signalPin: lrPin }),
    mosfetti(mfPins),
  ], [
    edge('lr', 'pot', 'value', 'sw', 'level'),
    edge('a', 'btn', 'pressed', 'mf', 'on'),
    edge('b', 'pot', 'value', 'mf', 'level2'),
    edge('d', 'pot', 'value', 'mf', 'level4'),
  ], dataPin)
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
  // The Mosfetti on classic ESP32 pins 16-19, one channel of each kind: A
  // switched by On, B dimmed by a wired Level alone, C dimmed from its Level
  // field and gated by On, D left unwired and held off.
  mosfetti: {
    source: sketch([button(), pot(), mosfetti([16, 17, 18, 19], { level3: 0.4 })], [
      edge('a', 'btn', 'pressed', 'mf', 'on'),
      edge('b', 'pot', 'value', 'mf', 'level2'),
      edge('c', 'btn', 'pressed', 'mf', 'on3'),
    ]),
    pwm: 2,
  },
  mixed: { source: mixed(12, 34, 25, [16, 17, 18, 19], 5), pwm: 3 },
  // NodeMCU: button D5, pot A0, LR7843 D1, Mosfetti D6 D7 D8 D0, LEDs D2.
  'mixed-esp8266': { source: mixed(14, 17, 5, [12, 13, 15, 16], 4), pwm: 3 },
  // Pico: the Mosfetti on GP18-21, as in MonkMakes' own Pico example.
  'mixed-rp2040': { source: mixed(14, 26, 15, [18, 19, 20, 21], 2), pwm: 3 },
  // Uno: the Mosfetti on D3, D5, D6 and D10, the PWM pins MonkMakes' Uno
  // example uses; LEDs move to D7. A switched, B dimmed.
  'mosfetti-avr': {
    source: sketch([
      node('btn', 'ButtonInput', { pin: 2 }),
      node('pot', 'PotInput', { pin: 14 }),
      mosfetti([3, 5, 6, 10]),
    ], [
      edge('a', 'btn', 'pressed', 'mf', 'on'),
      edge('b', 'pot', 'value', 'mf', 'level2'),
    ], 7),
    pwm: 1,
  },
}

// The frequency plan, checked in the source rather than trusted: the 1 kHz
// pair starts on an even LEDC channel, and single-timer cores run at 500 Hz.
for (const name of ['mixed', 'mixed-esp8266', 'mixed-rp2040']) {
  const source = fixtures[name].source
  if (!/flsPwmBegin\(\d+, 0, 500\);/.test(source) || (source.match(/flsPwmBegin\(\d+, [23], 1000\);/g)?.length ?? 0) !== 2
    || !source.includes('analogWriteFreq(500);')) {
    throw new Error(`${name}: the LEDC channels or the shared frequency are not the planned ones`)
  }
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
