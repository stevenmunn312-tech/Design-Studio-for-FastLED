import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { sanitizePin } from '../../../codegen/hardwarePins'
import { partDerivedInputs, keepsSavedPorts } from '../partPorts'
import { PART_OPTIONS, partOptionFor, resolvePartIdentity } from '../partOptions'
import { findPartReferences, isPartBusRef, isPartPinRef, usesOffBoardI2cBus } from '../partReferences'
import {
  describeUnresolved,
  hasUnknownPart,
  savedPartId,
  unknownPartId,
  unresolvedNodes,
  unresolvedPartSummaries,
  unresolvedSketchNotice,
  withoutUnresolved,
} from '../partResolution'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'output', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}
const edge = (id: string, source: string, target: string): StudioEdge =>
  ({ id, source, target, sourceHandle: 'out', targetHandle: 'in' }) as StudioEdge

describe('missing, known and unknown parts', () => {
  it('treats no value, or an empty one, as the default part and reports nothing', () => {
    for (const properties of [{}, { partId: undefined }, { partId: null }, { partId: '' }, { partId: '  ' }]) {
      expect(unknownPartId('DistanceInput', properties)).toBeNull()
      expect(savedPartId('DistanceInput', properties)).toBeNull()
    }
    expect(unresolvedNodes([node('d', 'DistanceInput', {})])).toEqual([])
  })

  it('accepts every option of every part-backed type, by id', () => {
    for (const [nodeType, config] of Object.entries(PART_OPTIONS)) {
      for (const option of config.options) {
        expect(unknownPartId(nodeType, { [config.property]: option.id }), `${nodeType} ${option.id}`).toBeNull()
      }
    }
  })

  it('accepts what a fresh node of each type holds', () => {
    // The default each definition ships must never read as an unknown part, or a
    // new node would block Upload the moment it is added.
    for (const definition of NODE_LIBRARY) {
      const config = PART_OPTIONS[definition.type]
      if (!config) continue
      const properties = { ...libraryDefaults(definition.type) }
      expect(unknownPartId(definition.type, properties), definition.type).toBeNull()
    }
  })

  it('knows the Amplifier by the model every earlier save holds', () => {
    expect(partOptionFor('Amplifier', 'MAX98357A')?.id).toBe('max98357a-i2s-amplifier')
    expect(unknownPartId('Amplifier', { model: 'MAX98357A' })).toBeNull()
    expect(unknownPartId('Amplifier', { model: 'max98357a-i2s-amplifier' })).toBeNull()
  })

  it('reports a non-empty id with no part as unknown, on the property the type uses', () => {
    expect(unknownPartId('DistanceInput', { partId: 'future-laser-tof' })).toBe('future-laser-tof')
    expect(unknownPartId('Amplifier', { model: 'future-i2s-amp' })).toBe('future-i2s-amp')
    // `partId` is not the Amplifier's property, so it is not read.
    expect(unknownPartId('Amplifier', { partId: 'future-i2s-amp' })).toBeNull()
    // A type with no part never reports one.
    expect(unknownPartId('SolidColor', { partId: 'whatever' })).toBeNull()
    expect(hasUnknownPart('RelayOutput', { partId: 'relay-module-16ch-5v' })).toBe(true)
  })

  it('does not take a part of another type for this one', () => {
    expect(unknownPartId('RelayOutput', { partId: 'hc-sr04-ultrasonic-module' })).toBe('hc-sr04-ultrasonic-module')
  })
})

describe('resolvePartIdentity', () => {
  it('still resolves a missing value to the type’s first option', () => {
    expect(resolvePartIdentity('DistanceInput', {})?.option.id).toBe('hc-sr04-ultrasonic-module')
    expect(resolvePartIdentity('DistanceInput', { partId: '' })?.unresolved).toBeUndefined()
  })

  it('resolves an unknown value to nothing but itself', () => {
    const identity = resolvePartIdentity('DistanceInput', { partId: 'future-laser-tof' })
    expect(identity).toMatchObject({ unresolved: true, option: { id: 'future-laser-tof', label: 'future-laser-tof' }, notes: [] })
    expect(identity?.entry).toBeUndefined()
  })

  it('keeps the encoder’s uncatalogued default for a missing value only', () => {
    expect(resolvePartIdentity('EncoderInput', {})).toBeNull()
    expect(resolvePartIdentity('EncoderInput', { partId: 'future-encoder' })?.unresolved).toBe(true)
  })
})

describe('ports of an unknown part', () => {
  it('derives none, so a caller keeps the saved ones', () => {
    expect(partDerivedInputs('RelayOutput', 'relay-module-16ch-5v')).toBeNull()
    expect(partDerivedInputs('RelayOutput', 'relay-module-4ch-5v')).toHaveLength(4)
    expect(partDerivedInputs('RelayOutput', undefined)).toHaveLength(1)
    expect(keepsSavedPorts('RelayOutput', { partId: 'relay-module-16ch-5v' })).toBe(true)
    expect(keepsSavedPorts('RelayOutput', { partId: 'relay-module-4ch-5v' })).toBe(false)
    expect(keepsSavedPorts('RelayOutput', {})).toBe(false)
  })
})

describe('holding a node back from the build', () => {
  const sensor = node('sensor', 'DistanceInput', { partId: 'future-laser-tof' })
  const fine = node('fine', 'DistanceInput', { partId: 'hc-sr04-ultrasonic-module' })

  it('returns the very same arrays when nothing is held', () => {
    const nodes = [fine]
    const edges: StudioEdge[] = []
    const result = withoutUnresolved(nodes, edges)
    expect(result.nodes).toBe(nodes)
    expect(result.edges).toBe(edges)
    expect(result.held).toEqual([])
  })

  it('leaves a held node and its wires out of the read, and the input untouched', () => {
    const nodes = [sensor, fine, node('t', 'Trigger')]
    const edges = [edge('a', 'sensor', 't'), edge('b', 'fine', 't')]
    const result = withoutUnresolved(nodes, edges)
    expect(result.nodes.map((n) => n.id)).toEqual(['fine', 't'])
    expect(result.edges.map((e) => e.id)).toEqual(['b'])
    expect(result.held.map((entry) => entry.node.id)).toEqual(['sensor'])
    expect(nodes).toHaveLength(3)
    expect(edges).toHaveLength(2)
  })

  it('says why, in plain words naming the id', () => {
    const [summary] = unresolvedPartSummaries([sensor])
    expect(summary).toBe(`This project uses a part this version doesn't have: "future-laser-tof" (DistanceInput).`)
    expect(unresolvedSketchNotice(unresolvedNodes([sensor]))).toMatch(/^\/\/ Not generated: This project uses a part this version doesn't have: DistanceInput — "future-laser-tof"\./)
    expect(describeUnresolved({ kind: 'part', property: 'partId', id: 'x' }).fix).toMatch(/newer Design Studio/)
  })
})

describe('reserved pin and bus references', () => {
  it('recognises the two object shapes and nothing else', () => {
    expect(isPartPinRef({ part: 'exp1', pin: 3 })).toBe(true)
    expect(isPartPinRef({ part: 'exp1', pin: 0 })).toBe(true)
    expect(isPartPinRef({ part: '', pin: 3 })).toBe(false)
    expect(isPartPinRef({ part: 'exp1' })).toBe(false)
    expect(isPartPinRef({ part: 'exp1', pin: '3' })).toBe(false)
    expect(isPartPinRef(3)).toBe(false)
    expect(isPartPinRef([3])).toBe(false)
    expect(isPartPinRef(null)).toBe(false)
    expect(isPartBusRef({ part: 'mux1', channel: 2 })).toBe(true)
    expect(isPartBusRef({ part: 'mux1', pin: 2 })).toBe(false)
  })

  it('finds a pin reference wherever it sits, and a bus reference only on i2cBus', () => {
    const found = findPartReferences({
      in1Pin: { part: 'exp1', pin: 4 },
      in2Pin: 5,
      buttons: [{ id: 'b', pin: { part: 'exp1', pin: 7 } }],
      i2cBus: { part: 'mux1', channel: 2 },
      other: { part: 'mux1', channel: 2 },
    })
    expect(found.map((finding) => `${finding.kind}:${finding.key}`)).toEqual(['pin:in1Pin', 'pin:buttons[0].pin', 'bus:i2cBus'])
  })

  it('treats an absent i2cBus as the board’s own bus', () => {
    expect(findPartReferences({ sdaPin: 21, sclPin: 22 })).toEqual([])
    expect(findPartReferences({ i2cBus: undefined })).toEqual([])
    expect(findPartReferences({ i2cBus: null })).toEqual([])
    expect(usesOffBoardI2cBus({})).toBe(false)
    expect(usesOffBoardI2cBus({ i2cBus: { part: 'mux1', channel: 0 } })).toBe(true)
  })

  it('holds a node carrying one, for every node type and without a part', () => {
    const relay = node('r', 'RelayOutput', { partId: 'relay-module-2ch-5v', in1Pin: { part: 'exp1', pin: 2 }, in2Pin: 5 })
    const bus = node('s', 'TemperatureInput', { i2cBus: { part: 'mux1', channel: 1 } })
    const plain = node('p', 'RelayOutput', { partId: 'relay-module-2ch-5v', in1Pin: 4, in2Pin: 5 })
    expect(unresolvedNodes([relay, bus, plain]).map((entry) => [entry.node.id, entry.reasons.map((reason) => reason.kind)]))
      .toEqual([['r', ['pin']], ['s', ['bus']]])
  })

  it('never lets a part pin become a GPIO number', () => {
    expect(sanitizePin({ part: 'exp1', pin: 4 }, 17)).toBe(17)
    expect(sanitizePin(4, 17)).toBe(4)
  })
})
