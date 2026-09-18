import { describe, expect, it } from 'vitest'
import {
  isPaletteBuilderNodeType,
  NODE_LIBRARY,
  PALETTE_BUILDER_NODE_TYPES,
  portsCompatible,
  propertyMeta,
  spliceTargetPorts,
} from '../nodeLibrary'

/*
 * The two metadata decisions HW-10 left open, pinned rather than described.
 *
 * Both are cases where a fact about a node was written down in more than one
 * place, or not written down at all and re-derived by whoever needed it next.
 */
describe('palette producers', () => {
  it('classifies a producer by whether it names a preset or builds one', () => {
    // Firmware has no runtime palette union: a builder emits its own
    // `pal_<id>` table and a selector resolves to a shared preset constant,
    // decided at generation time from the source node. Which is which is
    // derived from the one thing that already tells them apart — a selector
    // carries a `palette` property, a builder makes one out of its inputs.
    expect([...PALETTE_BUILDER_NODE_TYPES].sort())
      .toEqual(['CustomPalette', 'PaletteBank', 'PaletteBlend', 'PaletteFromImage', 'Poline'])
    expect(isPaletteBuilderNodeType('PaletteSelector')).toBe(false)
    expect(isPaletteBuilderNodeType('Fire2012')).toBe(false)
  })

  it('leaves no palette producer unclassified', () => {
    // A sixth producer added later is a builder or a selector by construction;
    // what it must never be is a node the generator falls through to
    // `props.palette ?? 'rainbow'` for while the browser shows its real colours.
    for (const def of NODE_LIBRARY) {
      if (!def.outputs.some((port) => port.dataType === 'palette')) continue
      const names = (def.defaultProperties ?? {}).palette !== undefined
      expect(isPaletteBuilderNodeType(def.type), `${def.type} builds`).toBe(!names)
    }
  })
})

describe('splice targets', () => {
  const def = (type: string) => NODE_LIBRARY.find((entry) => entry.type === type)!

  it('takes the primary input, which is the one declared first', () => {
    // Reordering a node's inputs for the inspector's sake would otherwise move
    // where a drop lands, silently.
    expect(spliceTargetPorts(def('Mask'), 'frame', 'frame')).toEqual({ inPort: 'frame', outPort: 'frame' })
    expect(spliceTargetPorts(def('Zones'), 'frame', 'frame')).toEqual({ inPort: 'base', outPort: 'frame' })
    expect(spliceTargetPorts(def('FieldWarp'), 'field', 'field')).toEqual({ inPort: 'field', outPort: 'field' })
    expect(spliceTargetPorts(def('Clamp'), 'float', 'float')).toEqual({ inPort: 'value', outPort: 'result' })
    expect(spliceTargetPorts(def('MapRange'), 'float', 'float')).toEqual({ inPort: 'value', outPort: 'result' })
  })

  it('honours the override where the inputs are peers', () => {
    // A and B are not primary-and-secondary; only the declaration says which
    // one an existing stream should become.
    expect(def('Blend').spliceInput).toBe('a')
    expect(spliceTargetPorts(def('Blend'), 'frame', 'frame')).toEqual({ inPort: 'a', outPort: 'frame' })
  })

  it('ignores an override the source cannot drive', () => {
    const contrived = { ...def('Blend'), spliceInput: 'amount' }
    // `amount` is a float, so a frame source falls back to declaration order
    // rather than landing on an input it cannot feed.
    expect(spliceTargetPorts(contrived, 'frame', 'frame')).toEqual({ inPort: 'a', outPort: 'frame' })
  })

  it('refuses a node that cannot pass the stream through', () => {
    expect(spliceTargetPorts(def('SolidColor'), 'frame', 'frame')).toBeNull()
  })

  /*
   * The audit itself, kept as a check rather than as a paragraph: every node
   * that can be spliced onto a cable resolves to its *first* compatible input
   * unless it says otherwise. That is only a safe default while the library
   * keeps declaring primaries first, so this asserts the invariant the default
   * rests on rather than the list of nodes that happen to satisfy it today.
   */
  it('never resolves past the first compatible input without an override', () => {
    for (const def of NODE_LIBRARY) {
      for (const source of new Set(def.inputs.map((port) => port.dataType))) {
        for (const target of new Set(def.outputs.map((port) => port.dataType))) {
          const ports = spliceTargetPorts(def, source, target)
          if (!ports) continue
          const first = def.inputs.find((port) => portsCompatible(source, port.dataType))!
          // The override only applies where the source can actually drive it,
          // so a Blend dropped on a float cable still falls back to order.
          const override = def.inputs.find((port) => port.id === def.spliceInput
            && portsCompatible(source, port.dataType))
          expect(ports.inPort, `${def.type} <- ${source}`).toBe(override?.id ?? first.id)
        }
      }
    }
  })
})

/*
 * A colour channel's range is derived from the shape of the node's own
 * defaults, because the names collide: `b` is blue on one node and an operand
 * on another. Without a range, a wire dropped on the row mints a 0-1 slider
 * for a 0-255 byte — the value is off by a factor of 255 and nothing says so.
 */
describe('colour channels', () => {
  const CHANNELS = ['r', 'g', 'b', 'rA', 'gA', 'bA', 'rB', 'gB', 'bB']

  it('gives every complete triple a 0-255 byte range', () => {
    const triples = [['r', 'g', 'b'], ['rA', 'gA', 'bA'], ['rB', 'gB', 'bB']]
    let seen = 0
    for (const def of NODE_LIBRARY) {
      const defaults = def.defaultProperties ?? {}
      for (const triple of triples) {
        if (!triple.every((key) => key in defaults)) continue
        seen += 1
        for (const key of triple) {
          expect(propertyMeta(def.type, key), `${def.type}.${key}`)
            .toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
          // The declared default has to be sayable on the control that shows it.
          const value = Number(defaults[key])
          expect(value, `${def.type}.${key}`).toBeGreaterThanOrEqual(0)
          expect(value, `${def.type}.${key}`).toBeLessThanOrEqual(255)
        }
      }
    }
    // Guards against the rule passing by matching nothing.
    expect(seen).toBeGreaterThan(10)
  })

  it('leaves a lone operand that happens to be named b alone', () => {
    // Formula Field and Custom Formula carry `a` and `b` as superformula
    // operands. An incomplete triple is not a colour, and giving one a byte
    // range would silently restate its domain.
    for (const def of NODE_LIBRARY) {
      const defaults = def.defaultProperties ?? {}
      const complete = ['r', 'g', 'b'].every((key) => key in defaults)
      if (complete || !('b' in defaults)) continue
      expect(propertyMeta(def.type, 'b'), `${def.type}.b`)
        .not.toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
    }
    expect(propertyMeta('FormulaField', 'b')).toEqual({ control: 'slider', min: 0.2, max: 3, step: 0.05 })
  })

  it('never lets a channel range reach a node that declares none', () => {
    for (const def of NODE_LIBRARY) {
      const defaults = def.defaultProperties ?? {}
      for (const key of CHANNELS) {
        if (key in defaults) continue
        expect(propertyMeta(def.type, key), `${def.type}.${key}`)
          .not.toEqual({ control: 'slider', min: 0, max: 255, step: 1 })
      }
    }
  })
})
