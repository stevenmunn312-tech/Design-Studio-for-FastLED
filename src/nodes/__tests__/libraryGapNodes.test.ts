/*
 * The D-08.10 second batch — the nodes the audit found the library lacked.
 * Each is held on both sides: the preview's frame, field or value, and the
 * line the sketch emits for it, with the shared rule module between them.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../../state/graphEvaluator'
import { generateCpp } from '../../codegen/cppGenerator'
import { NODE_LIBRARY, PALETTE_BUILDER_NODE_TYPES, libraryDefaults, propertyDescription } from '../../state/nodeLibrary'
import { bandLevel, bandSlots, slotCentreHz } from '../../audio/frequencyBand'
import { breatheEnvelope } from '../generative/classics1d'
import { frameQuarterTurns } from '../composite/frameTransform'
import { glitterBudget } from '../composite/glitter'
import { meterDistance, meterFill } from '../audioReactive/levelMeter'
import { isNormalizedOutput } from '../shared/signalRange'
import { loopPacingCpp, loopPacingMs } from '../../codegen/loopPacing'
import { controllerSettings } from '../../build/controllerSettings'
import { dmxNetworkProtocol, dmxUsesNetwork, sacnMulticastGroup } from '../../state/peripherals/dmxTransceiver'
import { workspaceTrustHolds } from '../../state/patterns/patternTrust'
import { usesNetwork } from '../../codegen/peripherals/networkCpp'
import type { Frame } from '../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
let edgeCount = 0
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `e${++edgeCount}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const outputsOf = (nodes: StudioNode[], edges: StudioEdge[], tick = 0) =>
  evaluateGraphFull(nodes, edges, tick, 8, 8, {}, true, true).outputs
const frameOf = (nodes: StudioNode[], edges: StudioEdge[], id: string, tick = 0) =>
  outputsOf(nodes, edges, tick).get(id)!.frame as Frame
const lit = (px: { r: number; g: number; b: number }) => px.r + px.g + px.b > 0

beforeEach(() => resetEvaluatorState())

describe('the one-dimensional classics', () => {
  it('Theater Chase lights every Nth LED along the axis on both sides', () => {
    const chase = node('c', 'TheaterChase', { spacing: 3 })
    const frame = frameOf([chase], [], 'c')
    expect(frame[0].map(lit)).toEqual([true, false, false, true, false, false, true, false])
    expect(frame[5].map(lit)).toEqual(frame[0].map(lit))
    const cpp = generateCpp([chase], [])
    expect(cpp).toContain('// Theater Chase')
    expect(cpp).toContain('((_k%_sp)+_sp)%_sp==0')
  })

  it('Color Wipe fills from one end and emits the same wipe', () => {
    const wipe = node('w', 'ColorWipe')
    expect(frameOf([wipe], [], 'w', 0)[0].every((px) => !lit(px))).toBe(true)
    const partial = frameOf([wipe], [], 'w', 60)[0]
    expect(lit(partial[0])).toBe(true)
    expect(lit(partial[7])).toBe(false)
    const reversed = frameOf([node('r', 'ColorWipe', { direction: 'reverse' })], [], 'r', 60)[0]
    expect(lit(reversed[7])).toBe(true)
    expect(lit(reversed[0])).toBe(false)
    const cpp = generateCpp([wipe], [])
    expect(cpp).toContain('// Color Wipe')
    expect(cpp).toContain('_i<_fill?_new:_old')
  })

  it('Breathe is a solid frame on a curve that rests at zero and peaks at one', () => {
    expect(breatheEnvelope('natural', 0)).toBeCloseTo(0, 6)
    expect(breatheEnvelope('natural', 0.5)).toBeCloseTo(1, 6)
    expect(breatheEnvelope('sine', 0.25)).toBeCloseTo(0.5, 6)
    expect(breatheEnvelope('triangle', 0.75)).toBeCloseTo(0.5, 6)
    const frame = frameOf([node('b', 'Breathe', { minLevel: 0.2 })], [], 'b', 150)
    const first = frame[0][0]
    expect(lit(first)).toBe(true)
    expect(frame.every((row) => row.every((px) => px.r === first.r && px.g === first.g && px.b === first.b))).toBe(true)
    const cpp = generateCpp([node('b', 'Breathe', { curve: 'natural' })], [])
    expect(cpp).toContain('// Breathe')
    expect(cpp).toContain('expf(sinf(')
  })
})

describe('Glitter', () => {
  it('budgets sparkles per LED and seeds them like Confetti', () => {
    expect(glitterBudget(1, 256)).toBe(4)
    expect(glitterBudget(0.5, 64)).toBe(0.5)
    const glitter = node('g', 'Glitter', { density: 1, seed: 7 })
    const frame = frameOf([glitter], [], 'g')
    expect(frame.flat().filter(lit)).toHaveLength(1)
    expect(frame.flat().find(lit)).toEqual({ r: 255, g: 255, b: 255 })
    const cpp = generateCpp([glitter], [])
    expect(cpp).toContain('// Glitter')
    expect(cpp).toContain('_rng_g=7u')
    expect(cpp).toContain('+=_gc')
    expect(generateCpp([node('p', 'Glitter', { glitterMode: 'replace' })], [])).toContain('=_gc;')
  })
})

describe('Frame Transform and the Blend mask', () => {
  it('flips, turns and slides a frame the same way on both sides', () => {
    expect(frameQuarterTurns('270')).toBe(3)
    expect(frameQuarterTurns('-90')).toBe(3)
    const wipe = node('w', 'ColorWipe')
    const flip = node('f', 'FrameTransform', { flipX: true })
    const row = frameOf([wipe, flip], [edge('w', 'frame', 'f', 'frame')], 'f', 60)[0]
    expect(lit(row[7])).toBe(true)
    expect(lit(row[0])).toBe(false)
    const slide = node('s', 'FrameTransform', { offsetX: 4 })
    const slid = frameOf([wipe, slide], [edge('w', 'frame', 's', 'frame')], 's', 60)[0]
    expect(lit(slid[4])).toBe(true)
    expect(lit(slid[3])).toBe(false)
    const cpp = generateCpp([wipe, node('t', 'FrameTransform', { rotate: '270', flipY: true })], [edge('w', 'frame', 't', 'frame')])
    expect(cpp).toContain('// Frame Transform')
    expect(cpp.match(/_nu=_v; _v=1\.0f-_u; _u=_nu;/g)).toHaveLength(3)
    expect(cpp).toContain('_v=1.0f-_v;')
  })

  it('a Blend mask scales the opacity per pixel', () => {
    const base = node('b', 'Breathe', { minLevel: 1 })
    const mask = node('m', 'ColorWipe')
    const blend = node('x', 'Blend', { amount: 1 })
    const edges = [edge('b', 'frame', 'x', 'b'), edge('m', 'frame', 'x', 'mask')]
    const row = frameOf([base, mask, blend], edges, 'x', 60)[0]
    expect(lit(row[0])).toBe(true)
    expect(lit(row[7])).toBe(false)
    const cpp = generateCpp([base, mask, blend], edges)
    expect(cpp).toContain('nblend(buf_x[_i], buf_b[_i],')
    expect(cpp).toContain('buf_m[_i].r+buf_m[_i].g+buf_m[_i].b')
    expect(propertyDescription('Blend', 'mask')).toBeTruthy()
  })
})

describe('the field helpers', () => {
  it('Gradient Field ramps linearly, radially and angularly', () => {
    const linear = outputsOf([node('l', 'GradientField')], []).get('l')!.field as Float32Array
    expect(linear[0]).toBeCloseTo(0, 6)
    expect(linear[7]).toBeCloseTo(1, 6)
    expect(linear[5 * 8 + 3]).toBeCloseTo(linear[3], 6)
    const radial = outputsOf([node('r', 'GradientField', { gradientType: 'radial' })], []).get('r')!.field as Float32Array
    expect(radial[0]).toBeCloseTo(1, 6)
    expect(radial[0]).toBeGreaterThan(radial[3 * 8 + 3])
    const stripes = outputsOf([node('s', 'GradientField', { repeat: 2 })], []).get('s')!.field as Float32Array
    expect(stripes[7]).toBeCloseTo(0, 6)
    const cpp = generateCpp([node('a', 'GradientField', { gradientType: 'angular' })], [])
    expect(cpp).toContain('/* GradientField: angular */')
    expect(cpp).toContain('atan2f(_dy,_dx)')
  })

  it('Float → Field fills with the clamped value and Field Blur averages neighbours', () => {
    const fill = outputsOf([node('v', 'FloatToField', { value: 0.25 })], []).get('v')!.field as Float32Array
    expect(Array.from(fill).every((x) => Math.abs(x - 0.25) < 1e-6)).toBe(true)
    const wired = outputsOf([node('k', 'Constant', { value: 3 }), node('v', 'FloatToField')], [edge('k', 'value', 'v', 'value')]).get('v')!.field as Float32Array
    expect(wired[0]).toBe(1)
    const ramp = node('g', 'GradientField')
    const blur = node('b', 'FieldBlur', { radius: 2 })
    const blurred = outputsOf([ramp, blur], [edge('g', 'field', 'b', 'field')]).get('b')!.field as Float32Array
    expect(blurred[0]).toBeGreaterThan(0)
    expect(blurred[3]).toBeCloseTo(3 / 7, 6)
    const cpp = generateCpp([ramp, blur, node('f', 'FloatToField')], [edge('g', 'field', 'b', 'field')])
    expect(cpp).toContain('_fbT_b[')
    expect(cpp).toContain('for(int _i=0;_i<NUM_LEDS;_i++) field_f[_i]=_fv;')
  })
})

describe('the audio helpers', () => {
  it('Frequency Band reads the slots whose centre falls in range, never none', () => {
    expect(slotCentreHz(0)).toBeCloseTo(90, 6)
    expect(bandSlots(60, 250)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(bandSlots(100, 101)).toHaveLength(2)
    const spectrum = Array.from({ length: 32 }, (_, i) => (i < 8 ? 1 : 0))
    expect(bandLevel(spectrum, 60, 250)).toBe(1)
    expect(bandLevel(spectrum, 300, 5000)).toBe(0)
    const band = node('f', 'FrequencyBand')
    expect(outputsOf([band], []).get('f')!.level).toBe(0)
    const cpp = generateCpp([band], [])
    expect(cpp).toContain('_fbC_f[16]={90.0f,')
    expect(cpp).toContain('_fbS_f')
    expect(isNormalizedOutput('FrequencyBand', 'level')).toBe(true)
  })

  it('Stereo Levels rests at a centred balance and Beat Phase free-runs at its tempo', () => {
    expect(outputsOf([node('s', 'StereoLevels')], []).get('s')).toEqual({ left: 0, right: 0, balance: 0.5 })
    expect(generateCpp([node('s', 'StereoLevels')], [])).toContain('float n_s_left=0.0f, n_s_right=0.0f;')
    const clock = node('p', 'BeatPhase', { bpm: 120, beatsPerBar: 4 })
    outputsOf([clock], [], 0)
    const later = outputsOf([clock], [], 15).get('p')!
    expect(later.phase).toBeCloseTo(0.5, 6)
    expect(later.count).toBe(0)
    expect(later.bar).toBeCloseTo(0.125, 6)
    const cpp = generateCpp([clock], [])
    expect(cpp).toContain('_bpm/60.0f')
    expect(cpp).toContain('%4u)+_ph)/4.0f')
  })

  it('Level Meter fills from its origin with a peak marker', () => {
    expect(meterFill(0.5, 8)).toBe(4)
    expect(meterDistance('end', 7, 8)).toBe(0)
    expect(meterDistance('center', 0, 8)).toBe(7)
    const meter = node('m', 'LevelMeter', { level: 0.5 })
    const row = frameOf([meter], [], 'm')[0]
    expect(row.map(lit)).toEqual([true, true, true, true, false, false, false, false])
    const cpp = generateCpp([meter], [])
    expect(cpp).toContain('// Level Meter')
    expect(cpp).toContain('_pk_m')
  })
})

describe('sACN on the DMX input', () => {
  it('is a network mode like Art-Net: trust-gated, a network user, its own listener', () => {
    const sacn = { inputMode: 'sACN', universe: 3 }
    expect(dmxUsesNetwork(sacn)).toBe(true)
    expect(dmxNetworkProtocol(sacn)).toBe('sACN')
    expect(dmxUsesNetwork({ inputMode: 'DMX512' })).toBe(false)
    expect(sacnMulticastGroup(300)).toEqual([239, 255, 1, 44])
    expect(workspaceTrustHolds([node('d', 'DMXInput', sacn)]).artnet).toBe(true)
    expect(workspaceTrustHolds([node('d', 'DMXInput', { inputMode: 'DMX512' })]).artnet).toBe(false)
    expect(usesNetwork(node('d', 'DMXInput', sacn))).toBe(true)
    const cpp = generateCpp([node('d', 'DMXInput', sacn), node('c', 'DMXChannel', { channel: 1 })], [edge('d', 'dmx', 'c', 'dmx')])
    expect(cpp).toContain('_sacnUdp_d.beginMulticast(IPAddress(239, 255, 0, 3), 5568);')
    expect(cpp).toContain('"ASC-E1.17\\0\\0\\0"')
    expect(cpp).toContain('_sacnUni_d == 3')
    expect(cpp).toContain('_dmxData_d[0]')
  })
})

describe('the Board frame-rate cap', () => {
  it('paces every sketch loop and the preview gate from one Board property', () => {
    expect(loopPacingMs(60)).toBe(16)
    expect(loopPacingMs(30)).toBe(33)
    expect(loopPacingMs(500)).toBe(8)
    expect(loopPacingCpp(24)).toBe('  FastLED.delay(41);  // ~24 fps')
    expect(controllerSettings([node('b', 'Board', { frameRate: 24 })]).frameRate).toBe(24)
    expect(controllerSettings([]).frameRate).toBe(60)
    expect(generateCpp([node('b', 'Board', { frameRate: 24 }), node('c', 'Breathe')], [])).toContain('FastLED.delay(41);  // ~24 fps')
    expect(propertyDescription('Board', 'frameRate')).toBeTruthy()
  })
})

describe('Text with a wired string and Palette Transform', () => {
  it('draws a wired string at run time from one font table', () => {
    const value = node('v', 'TextValue', { text: 'HI' })
    const text = node('t', 'Text', { text: 'NOPE' })
    const twin = node('u', 'Text')
    const edges = [edge('v', 'text', 't', 'text'), edge('v', 'text', 'u', 'text')]
    const frame = frameOf([value, text, twin], edges, 't')
    expect(frame.flat().some(lit)).toBe(true)
    const cpp = generateCpp([value, text, twin], edges)
    expect(cpp).toContain('// Text (wired)')
    expect(cpp).toContain('_fontCol(_ts[_ci / 4], _gc)')
    expect(cpp.match(/static uint8_t _fontCol\(/g)).toHaveLength(1)
    expect(generateCpp([text], [])).toContain('// Text "NOPE"')
  })

  it('reverses, rotates and dims a palette as a builder', () => {
    expect(PALETTE_BUILDER_NODE_TYPES.has('PaletteTransform')).toBe(true)
    const plain = outputsOf([node('p', 'PaletteTransform')], []).get('p')!.palette as { r: number; g: number; b: number }[]
    const reversed = outputsOf([node('r', 'PaletteTransform', { reverse: true })], []).get('r')!.palette as { r: number; g: number; b: number }[]
    expect(plain).toHaveLength(16)
    expect(reversed[0]).toEqual(plain[15])
    const dark = outputsOf([node('d', 'PaletteTransform', { brightness: 0 })], []).get('d')!.palette as { r: number; g: number; b: number }[]
    expect(dark.every((c) => c.r === 0 && c.g === 0 && c.b === 0)).toBe(true)
    const cpp = generateCpp([node('r', 'PaletteTransform', { reverse: true })], [])
    expect(cpp).toContain('CRGBPalette16 pal_r;')
    expect(cpp).toContain('int _k=15-_i;')
  })
})
