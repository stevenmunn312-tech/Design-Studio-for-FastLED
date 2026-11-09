import { describe, expect, it } from 'vitest'
import { FIELD_DEFINITIONS } from '../definitions'
import { SHAPES_DEFINITIONS } from '../../shapes/definitions'
import { propertyLabel } from '../../../state/nodeLibrary'

// A property input's socket is drawn on its property row, so the port and the
// row must read the same, or a wired socket names a different knob from the
// one it drives. Two app-wide conventions are left alone: colour channel pairs
// (R (A), red A) and the T (0–1) socket.
const CONVENTION_KEYS = new Set(['rA', 'gA', 'bA', 'rB', 'gB', 'bB'])

describe('field and shape port labels', () => {
  it('match the property row each socket sits on', () => {
    const mismatches: string[] = []
    for (const def of [...FIELD_DEFINITIONS, ...SHAPES_DEFINITIONS]) {
      for (const [key, portId] of Object.entries(def.propertyInputs ?? {})) {
        const port = def.inputs.find((input) => input.id === portId)
        if (!port || CONVENTION_KEYS.has(key) || port.label === 'T (0–1)') continue
        const row = propertyLabel(def.type, key, def.defaultProperties ?? {})
        if (row.toLowerCase() !== port.label.toLowerCase()) mismatches.push(`${def.type}.${key}: port "${port.label}", row "${row}"`)
      }
    }
    expect(mismatches).toEqual([])
  })
})
