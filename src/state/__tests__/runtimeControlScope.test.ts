import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY } from '../nodeLibrary'
import { exposableInputsFor, normalizeExposedInputs } from '../propertyInputs'
import {
  BAKE_TIME_PROPERTIES,
  GROUP_BOUNDARY,
  LIVE_PLAYER_SHOW_PROPERTIES,
  MAIN_SUBSTANCE_TYPES,
} from '../runtimeControlScope'

const byType = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))

describe('step 9 runtime control scope', () => {
  it('keeps every listed live player/show field on a verified property input', () => {
    for (const [type, keys] of Object.entries(LIVE_PLAYER_SHOW_PROPERTIES)) {
      const definition = byType.get(type)
      expect(definition, type).toBeDefined()
      const declared = Object.keys(definition!.propertyInputs ?? {})
      expect(declared).toEqual(expect.arrayContaining([...keys]))
      for (const key of keys) {
        expect(definition!.defaultProperties, `${type}.${key}`).toHaveProperty(key)
      }
    }
  })

  it('refuses a property input for bake-time player, show and group bindings', () => {
    for (const [type, keys] of Object.entries(BAKE_TIME_PROPERTIES)) {
      const definition = byType.get(type)
      expect(definition, type).toBeDefined()
      const declared = new Set(Object.keys(definition!.propertyInputs ?? {}))
      for (const key of keys) {
        expect(declared.has(key), `${type}.${key} must stay bake-time`).toBe(false)
      }
    }
    expect(GROUP_BOUNDARY.useGroupInputsIsBakeTime).toBe(true)
    expect(byType.get('PerformanceGenerator')!.propertyInputs).toBeUndefined()
  })

  it('does not hide main substance ports behind property or action inputs', () => {
    for (const definition of NODE_LIBRARY) {
      const hideable = new Set([
        ...Object.values(definition.propertyInputs ?? {}),
        ...(definition.actionInputs ?? []),
      ])
      for (const port of definition.inputs) {
        if (!MAIN_SUBSTANCE_TYPES.has(port.dataType)) continue
        expect(
          hideable.has(port.id),
          `${definition.type}.${port.id} (${port.dataType}) must stay visible`,
        ).toBe(false)
      }
    }
  })

  it('only default-exposes ports that are actually exposable', () => {
    for (const definition of NODE_LIBRARY) {
      const allowed = new Set(exposableInputsFor(definition.type).map((port) => port.id))
      for (const id of definition.defaultExposedInputs ?? []) {
        expect(allowed.has(id), `${definition.type} defaultExposedInputs ${id}`).toBe(true)
      }
      expect(normalizeExposedInputs(definition.type, definition.defaultExposedInputs))
        .toEqual([...(definition.defaultExposedInputs ?? [])].filter((id) => allowed.has(id)))
    }
  })

  it('offers an expose list exactly when a node has property or action inputs', () => {
    for (const definition of NODE_LIBRARY) {
      const hasDeclarations = Object.keys(definition.propertyInputs ?? {}).length
        + (definition.actionInputs ?? []).length
      expect(exposableInputsFor(definition.type).length > 0).toBe(hasDeclarations > 0)
    }
  })
})
