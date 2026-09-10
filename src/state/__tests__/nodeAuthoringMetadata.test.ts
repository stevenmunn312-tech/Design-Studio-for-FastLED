import { describe, expect, it } from 'vitest'
import {
  isPaletteBuilderNodeType,
  NODE_LIBRARY,
  PALETTE_BUILDER_NODE_TYPES,
  portsCompatible,
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
      .toEqual(['CustomPalette', 'PaletteBlend', 'PaletteFromImage', 'Poline'])
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
