import { describe, it, expect } from 'vitest'
import {
  blankDeckConfig,
  normalizeDeckConfig,
  interpolateScene,
  scaleMidiValueToPin,
  isPinnableProperty,
  deriveControlShape,
  serializeKeyCombo,
  type PinnedControl,
  type ParameterScene,
} from '../performanceDeck'
import { presettableProperties } from '../nodePresets'

function pin(overrides: Partial<PinnedControl> = {}): PinnedControl {
  return {
    id: 'pin-1',
    nodeId: 'node-1',
    propertyKey: 'speed',
    label: 'Speed',
    kind: 'fader',
    min: 0,
    max: 1,
    step: 0.1,
    createdAt: 0,
    ...overrides,
  }
}

function scene(id: string, values: Record<string, unknown>): ParameterScene {
  return { id, name: id, values, createdAt: 0, updatedAt: 0 }
}

describe('normalizeDeckConfig', () => {
  it('returns a blank config for undefined/malformed input', () => {
    expect(normalizeDeckConfig(undefined)).toEqual(blankDeckConfig())
    expect(normalizeDeckConfig(null)).toEqual(blankDeckConfig())
    expect(normalizeDeckConfig('not an object')).toEqual(blankDeckConfig())
    expect(normalizeDeckConfig({})).toEqual(blankDeckConfig())
  })

  it('drops malformed entries but keeps well-formed ones', () => {
    const result = normalizeDeckConfig({
      pins: [pin(), { nodeId: 'missing-fields' }],
      scenes: [scene('s1', { 'pin-1': 0.5 }), { id: 'bad' }],
      midiBindings: [
        { id: 'm1', target: { kind: 'pin', pinId: 'pin-1' }, message: 'cc', channel: 0, number: 74, createdAt: 0 },
        { id: 'm2', target: { kind: 'bogus' } },
      ],
      keyBindings: [
        { id: 'k1', combo: 'F7', action: { type: 'panic' }, createdAt: 0 },
        { id: 'k2', combo: 'F6', action: { type: 'bogus' } },
      ],
    })
    expect(result.pins).toHaveLength(1)
    expect(result.scenes).toHaveLength(1)
    expect(result.midiBindings).toHaveLength(1)
    expect(result.keyBindings).toHaveLength(1)
  })

  it('round-trips a well-formed config unchanged', () => {
    const config = {
      pins: [pin()],
      scenes: [scene('s1', { 'pin-1': 0.5 })],
      midiBindings: [
        { id: 'm1', target: { kind: 'morph' }, message: 'note' as const, channel: 3, number: 60, createdAt: 1 },
      ],
      keyBindings: [
        { id: 'k1', combo: 'Ctrl+1', action: { type: 'recallScene' as const, sceneId: 's1' }, createdAt: 1 },
      ],
    }
    expect(normalizeDeckConfig(config)).toEqual(config)
  })
})

describe('interpolateScene', () => {
  const pins = [pin({ id: 'p-num', step: 0.5 }), pin({ id: 'p-bool', kind: 'toggle' }), pin({ id: 'p-missing' })]

  it('lerps numeric values and snaps to step', () => {
    const a = scene('a', { 'p-num': 0 })
    const b = scene('b', { 'p-num': 10 })
    expect(interpolateScene(a, b, 0, pins)['p-num']).toBe(0)
    expect(interpolateScene(a, b, 1, pins)['p-num']).toBe(10)
    expect(interpolateScene(a, b, 0.5, pins)['p-num']).toBe(5)
    // step 0.5: 0.23 -> lerp to 2.3 -> snapped to 2.5
    expect(interpolateScene(a, b, 0.23, pins)['p-num']).toBe(2.5)
  })

  it('hard-switches boolean/select values at t >= 0.5', () => {
    const a = scene('a', { 'p-bool': false })
    const b = scene('b', { 'p-bool': true })
    expect(interpolateScene(a, b, 0.49, pins)['p-bool']).toBe(false)
    expect(interpolateScene(a, b, 0.5, pins)['p-bool']).toBe(true)
    expect(interpolateScene(a, b, 1, pins)['p-bool']).toBe(true)
  })

  it('skips a pin missing from either scene', () => {
    const a = scene('a', { 'p-num': 0 })
    const b = scene('b', { 'p-num': 10 })
    const result = interpolateScene(a, b, 0.5, pins)
    expect('p-missing' in result).toBe(false)
  })
})

describe('scaleMidiValueToPin', () => {
  it('scales a normalized value onto a fader/knob range with step snapping', () => {
    const p = pin({ kind: 'fader', min: 0, max: 100, step: 10 })
    expect(scaleMidiValueToPin(p, 0)).toBe(0)
    expect(scaleMidiValueToPin(p, 1)).toBe(100)
    expect(scaleMidiValueToPin(p, 0.53)).toBe(50)
  })

  it('thresholds a toggle at 0.5', () => {
    const p = pin({ kind: 'toggle' })
    expect(scaleMidiValueToPin(p, 0.49)).toBe(false)
    expect(scaleMidiValueToPin(p, 0.5)).toBe(true)
  })

  it('indexes into options for a select pin', () => {
    const p = pin({ kind: 'select', options: ['a', 'b', 'c', 'd'] })
    expect(scaleMidiValueToPin(p, 0)).toBe('a')
    expect(scaleMidiValueToPin(p, 0.99)).toBe('d')
  })
})

describe('isPinnableProperty', () => {
  it('excludes structural keys', () => {
    expect(isPinnableProperty('Circle', 'font')).toBe(false)
    expect(isPinnableProperty('MatrixOutput', 'width')).toBe(false)
    expect(isPinnableProperty('Group', 'bypassed')).toBe(false)
  })

  it('allows plain numeric/boolean properties without metadata', () => {
    expect(isPinnableProperty('Fire', 'cooling', 55)).toBe(true)
    expect(isPinnableProperty('Trails', 'decay', true)).toBe(true)
  })

  it('diverges from nodePresets.presettableProperties on MatrixOutput.brightness', () => {
    // presettableProperties blanket-excludes every input/output/hardware
    // category node, which would wrongly hide the exact property "master
    // brightness" needs to pin. isPinnableProperty must not inherit that
    // exclusion — this test guards against a future refactor collapsing the
    // two filters back together.
    expect(isPinnableProperty('MatrixOutput', 'brightness', 200)).toBe(true)
    expect(presettableProperties('MatrixOutput', { brightness: 200 })).toEqual({})
  })

  it('excludes physical wiring on MicInput and MatrixOutput, but not lookalike keys elsewhere', () => {
    expect(isPinnableProperty('MicInput', 'i2sWs', 39)).toBe(false)
    expect(isPinnableProperty('MicInput', 'i2sSck', 40)).toBe(false)
    expect(isPinnableProperty('MicInput', 'i2sSd', 41)).toBe(false)
    expect(isPinnableProperty('MicInput', 'channel', 'Left')).toBe(false)
    expect(isPinnableProperty('MatrixOutput', 'chipset', 'WS2812B')).toBe(false)
    expect(isPinnableProperty('MatrixOutput', 'colorOrder', 'GRB')).toBe(false)
    expect(isPinnableProperty('MatrixOutput', 'dataPin', 5)).toBe(false)
    expect(isPinnableProperty('MatrixOutput', 'clockPin', 6)).toBe(false)
    expect(isPinnableProperty('MatrixOutput', 'serpentine', false)).toBe(false)
    // gain is the live-tunable MicInput control, not wiring — must stay pinnable.
    expect(isPinnableProperty('MicInput', 'gain', 1)).toBe(true)
  })
})

describe('deriveControlShape', () => {
  it('reads select options from propertyMeta', () => {
    expect(deriveControlShape('Rainbow', 'palette', 'rainbow')).toEqual(
      expect.objectContaining({ kind: 'select' })
    )
  })

  it('reads slider bounds from propertyMeta (MatrixOutput brightness override)', () => {
    const shape = deriveControlShape('MatrixOutput', 'brightness', 200)
    expect(shape.kind).toBe('fader')
    expect(shape.max).toBe(255)
  })

  it('falls back to toggle for booleans with no metadata', () => {
    expect(deriveControlShape('Circle', 'someUnmappedBoolFlag', true).kind).toBe('toggle')
  })
})

describe('serializeKeyCombo', () => {
  function evt(key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) {
    return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }
  }

  it('serializes a plain key', () => {
    expect(serializeKeyCombo(evt('F7'))).toBe('F7')
  })

  it('serializes modifier combos in a stable order', () => {
    expect(serializeKeyCombo(evt('a', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+A')
  })

  it('folds metaKey (Cmd) into the same Ctrl token', () => {
    expect(serializeKeyCombo(evt('s', { metaKey: true }))).toBe('Ctrl+S')
  })

  it('returns an empty string for a bare modifier keypress', () => {
    expect(serializeKeyCombo(evt('Control', { ctrlKey: true }))).toBe('')
  })

  it('is stable across repeated calls with the same event', () => {
    const e = evt('F7', { shiftKey: true })
    expect(serializeKeyCombo(e)).toBe(serializeKeyCombo(e))
  })
})
