import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { generateCpp } from '../../../codegen/cppGenerator'
import { itemLayouts, peripheralGroundPadIndex, peripheralPadCount, peripheralPadPoint, peripheralPadRadius, peripheralPowerNet, peripheralRearRoute, peripheralPowerPadIndex } from '../../../components/BuildDiagram/physicalDiagramLayout'
import { inputPartEntries } from '../../../components/Hardware/hardwarePartCatalog'
import { useBenchParts } from '../../../components/Hardware/useBenchParts'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { libraryDefaults, NODE_LIBRARY, propertyMetaFor, propertyOptions } from '../../../state/nodeLibrary'
import { FIRST_BUTTON_HANDLE, singleButtonRow } from '../../../state/player/buttonBank'
import { validateGraph } from '../../../utils/validateGraph'
import { boardProfileById } from '../../boards/boardProfiles'
import { buildHardwareManifest } from '../../hardwareManifest'
import {
  PART_CATALOGUE, bundledPartsForType, partOrigin, registerParts, resetRegisteredPartsForTests,
} from '../partCatalogue'
import { partFieldOptions, PART_FIELDS } from '../partFields'
import { partOptionProperty, partOptionsFor, resolvePartIdentity } from '../partOptions'
import { partRenderForNodeType } from '../partRenders'
import { unknownPartId, unresolvedNodes } from '../partResolution'
import { PART_TYPES, partTypeDrivesDevice, type PartTypeDefinition } from '../partTypes'
import { validatePartManifest } from '../manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../manifest/vocabulary'
import type { PartManifest } from '../manifest/partManifest'

/*
 * Every part type that is open to downloads must hold its bar: a part written
 * only as a manifest, with a fresh id and no entry in any code list, behaves
 * exactly as the bundled part it was copied from.
 *
 * Two layers. The first is static: the type has its block, its chip list, and
 * every bundled part of the type would be accepted as a downloaded one. The
 * second builds, for each bundled part, a copy under a new id, registers it as
 * a downloaded part, and runs both the original and the copy through the
 * preview evaluator, firmware generation, the hardware manifest, the Build
 * Diagram layout, validation, the option rows and the bench. Each result must
 * be identical once the new id is read back as the old one: any difference is
 * a branch on, or a lookup of, a bundled part's id.
 */

const OPEN_TYPES: PartTypeDefinition[] = PART_TYPES.filter((definition) => definition.downloadable)

/** The one type whose block may be left out, and why: an LDR module is read as a raw analog level. */
const OPTIONAL_BLOCK_JUSTIFICATION: Record<string, string> = {
  LightInput: 'an LDR module is read as a raw analog level and carries no lightSensor calibration',
  PowerAmplifier: 'the passive 4 ohm speaker is filed under the type for the shelf and has no amplifier facts',
}

/**
 * A type with no bundled part yet (the generic sensors) is checked from a base
 * manifest written here: two registered parts under different ids must behave
 * alike, which is the same claim as a copy of a bundled one.
 */
function baseManifest(partId: string, partType: string, extra: Partial<PartManifest>): PartManifest {
  return {
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    partId,
    label: `Base ${partId}`,
    partTypes: [partType],
    categories: [],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    dimensionsMm: { width: 22, height: 14 },
    pinLabelsLeftToRight: ['VCC', 'OUT', 'GND'],
    copy: { summary: 'A generic sensor' },
    ...extra,
  } as PartManifest
}

const UNBUNDLED_BASES: Record<string, PartManifest[]> = {
  DigitalSensorInput: [
    baseManifest('base-reed-switch', 'DigitalSensorInput', {
      digitalSensor: { activeLevel: 'low', pullUp: 'internal', debounceMs: 20, activeLabel: 'Magnet near', idleLabel: 'Magnet away' },
    }),
    baseManifest('base-hall-module', 'DigitalSensorInput', {
      digitalSensor: { activeLevel: 'high', pullUp: 'none', debounceMs: 0, supplyVolts: 5, activeLabel: 'Field present', idleLabel: 'No field' },
    }),
  ],
  AnalogSensorInput: [
    baseManifest('base-soil-probe', 'AnalogSensorInput', {
      analogSensor: {
        unit: '%', supplyVolts: 3.3, adcRange: { minVolts: 0, maxVolts: 3.3 },
        curve: [{ volts: 1.2, value: 100 }, { volts: 2.8, value: 0 }], outputMin: 0, outputMax: 100, decimals: 0,
      },
    }),
    baseManifest('base-force-pad', 'AnalogSensorInput', {
      analogSensor: {
        unit: 'N', supplyVolts: 3.3, adcRange: { minVolts: 0, maxVolts: 3.3 },
        curve: [{ volts: 0.3, value: 0 }, { volts: 1.3, value: 5 }, { volts: 3.0, value: 20 }], outputMin: 0, outputMax: 20,
      },
    }),
  ],
}

/** The property a node of this type stores its part in: `partId` for most, `model` for an Amplifier. */
function namingPart(nodeType: string, partId: string): Record<string, unknown> {
  return { [partOptionProperty(nodeType) ?? 'partId']: partId }
}

const FRESH_ID_SUFFIX = '-registry-copy'

function freshId(partId: string): string {
  return `${partId}${FRESH_ID_SUFFIX}`.slice(0, 80)
}

/** A manifest a downloader could publish: the bundled part's data under a new id. */
function syntheticOf(source: PartManifest, partId: string): PartManifest {
  const copy = JSON.parse(JSON.stringify(source)) as PartManifest
  const text = { ...copy.copy }
  // The menu position belongs to the bundled part, not to a copy (the menu name stays,
  // so a label in a result is the same on both sides).
  delete text.optionOrder
  return {
    ...copy,
    ...(copy.copy ? { copy: text } : {}),
    partId,
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
  }
}

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

/** Every wiring the firmware for `nodeType` has a distinct path for: one graph per output, or one for the inputs. */
function firmwareGraphs(nodeType: string, properties: Record<string, unknown>): Array<{ nodes: StudioNode[]; edges: StudioEdge[] }> {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  const out = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  const part = node('part', nodeType, properties)
  const graphs: Array<{ nodes: StudioNode[]; edges: StudioEdge[] }> = []
  if (nodeType === 'InfoDisplay' || nodeType === 'TransportDisplay' || nodeType === 'SegmentDisplay') {
    graphs.push({
      nodes: [node('fill', 'SolidColor'), out, part],
      edges: [edge('frame', 'fill', 'frame', 'out', 'frame'), edge('display', 'out', 'display', 'part', 'display')],
    })
    return graphs
  }
  for (const port of definition.outputs.slice(0, 8)) {
    graphs.push({
      nodes: [part, node('map', 'MapRange', { inMin: 0, inMax: 1, outMin: 0, outMax: 1 }), node('gauge', 'Gauge'), out],
      edges: [
        edge('read', 'part', port.id, 'map', 'value'),
        edge('level', 'map', 'result', 'gauge', 'value'),
        edge('frame', 'gauge', 'frame', 'out', 'frame'),
      ],
    })
  }
  if (definition.inputs.length > 0) {
    // A level drives the numeric inputs and a pressed button the boolean ones.
    graphs.push({
      nodes: [node('pot', 'PotInput', { pin: 34 }), node('fill', 'SolidColor'), out, part],
      edges: [
        edge('frame', 'fill', 'frame', 'out', 'frame'),
        ...definition.inputs.map((port) => edge(`in-${port.id}`, 'pot', 'value', 'part', port.id)),
      ],
    })
    graphs.push({
      nodes: [node('btn', 'ButtonBank', { buttons: singleButtonRow(15) }), node('fill', 'SolidColor'), out, part],
      edges: [
        edge('frame', 'fill', 'frame', 'out', 'frame'),
        ...definition.inputs.map((port) => edge(`in-${port.id}`, 'btn', FIRST_BUTTON_HANDLE, 'part', port.id)),
      ],
    })
  }
  return graphs
}

const BENCH_BOARD = boardProfileById('esp32-generic-devkit-38pin')

/** Everything the app derives from a part-backed node, as text with ids swapped for `readAs`. */
function observe(nodeType: string, partId: string, readAs: string): Record<string, string> {
  resetEvaluatorState()
  const properties = namingPart(nodeType, partId)
  const part = node('part', nodeType, properties)
  const result: Record<string, string> = {}
  const text = (value: unknown) => JSON.stringify(value, (_key, item) => (item === undefined ? '__undefined__' : item))
    .split(partId).join(readAs)

  result.evaluation = text([...evaluateGraphFull([part], [], 0, 8, 8).outputs.entries()])
  result.firmware = text(firmwareGraphs(nodeType, properties).map((graph) => generateCpp(graph.nodes, graph.edges)))

  const manifest = buildHardwareManifest([part, node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })], [], 'esp32:esp32:esp32')
  result.manifest = text(manifest)
  const items = [...manifest.primaryItems, ...manifest.items]
  result.layout = text(itemLayouts(manifest.items))
  result.pads = text(items.filter((item) => item.facts.partId === partId).map((item) => {
    const layout = { item, x: 0, y: 0, width: 100, height: 100 }
    const count = peripheralPadCount(item)
    return {
      kind: item.kind,
      count,
      points: Array.from({ length: count }, (_, index) => peripheralPadPoint(layout, index)),
      rear: Array.from({ length: count }, (_, index) => peripheralRearRoute(layout, index)),
      radius: peripheralPadRadius(item),
      net: peripheralPowerNet(item),
      power: peripheralPowerPadIndex(item),
      ground: peripheralGroundPadIndex(item),
    }
  }))

  result.validation = text(validateGraph([part, node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })], [], 'esp32:esp32:esp32'))

  // Every property row the node draws: its control, its range and the options its part allows.
  result.properties = text(Object.keys(libraryDefaults(nodeType)).map((key) => [
    key, propertyMetaFor(nodeType, key, properties), propertyOptions(nodeType, key, properties),
  ]))

  // The bench popup's fields for the node, and the choices of each select.
  result.fields = text((PART_FIELDS[nodeType] ?? []).map((field) =>
    (field.kind === 'select' ? { ...field, optionsFor: undefined, options: partFieldOptions(field, properties) } : field)))

  const identity = resolvePartIdentity(nodeType, properties)
  result.identity = text({ option: identity?.option.id, label: identity?.entry?.label, unresolved: identity && 'unresolved' in identity ? identity.unresolved : undefined })
  result.render = text(partRenderForNodeType(nodeType, properties))

  const { result: bench } = renderHook(() => useBenchParts({ nodes: [part], edges: [], selectedBoard: BENCH_BOARD }))
  // A shelf row's layout id (`partId` beside a `nodeType`) is made from the part id, so it is not compared.
  // A bundled input row's pin captions are written by hand ("SDA (SDI)") where a derived row prints
  // the silkscreen ("SDI"); the pin keys, which decide the wiring, are still compared.
  const bench_ = (parts: unknown, captions: boolean) => JSON.stringify(parts, function replacer(key, item) {
    if (key === 'partId' && ('nodeType' in this || 'entry' in this)) return undefined
    if (!captions && key === 'label' && 'key' in this) return this.key
    return item === undefined ? '__undefined__' : item
  }).split(partId).join(readAs)
  result.bench = `${bench_(bench.current.inputParts, false)}\n${bench_(bench.current.fixtureParts, true)}`
  return result
}

/** 'same', or a short window around where two serialised results first differ. */
function firstDifference(copy: string, original: string): string {
  if (copy === original) return 'same'
  let at = 0
  while (at < copy.length && at < original.length && copy[at] === original[at]) at += 1
  const window = (text: string) => text.slice(Math.max(0, at - 70), at + 70)
  return `differs at ${at}: copy ...${window(copy)}... original ...${window(original)}...`
}

afterEach(() => resetRegisteredPartsForTests())

describe('the registry of part types open to downloads', () => {
  it('has opened types to check', () => {
    expect(OPEN_TYPES.length).toBeGreaterThan(0)
  })

  it.each(OPEN_TYPES.map((definition) => [definition.nodeType, definition] as const))(
    '%s names its block, or says why it may not',
    (_nodeType, definition) => {
      if (definition.blockOptional) {
        expect(definition.block, 'blockOptional needs a block to be optional').toBeDefined()
        expect(OPTIONAL_BLOCK_JUSTIFICATION[definition.nodeType], 'justify a block-less part').toBeTruthy()
      } else {
        expect(definition.block, `${definition.nodeType} has no block`).toBeDefined()
      }
    },
  )

  it.each(OPEN_TYPES.filter((definition) => definition.deviceField).map((definition) => [definition.nodeType, definition] as const))(
    '%s drives the chip of every bundled part of the type',
    (_nodeType, definition) => {
      expect(definition.devices?.length, `${definition.nodeType} has a deviceField but no devices`).toBeGreaterThan(0)
      for (const part of bundledPartsForType(definition.nodeType)) {
        const block = definition.block ? (part as unknown as Record<string, unknown>)[definition.block] : undefined
        expect(partTypeDrivesDevice(definition, block), `${part.partId}: chip not in ${definition.nodeType}.devices`).toBe(true)
      }
    },
  )

  /** Each part a type is checked with: the bundled ones, or the bases written above when there are none. */
  const checkedParts = OPEN_TYPES.flatMap((definition) => {
    const bundled = bundledPartsForType(definition.nodeType)
    const parts = bundled.length > 0 ? bundled : (UNBUNDLED_BASES[definition.nodeType] ?? [])
    return parts.map((part) => ({ definition, part, bundled: bundled.length > 0 }))
  })
  const cases = checkedParts.map((entry) => [`${entry.definition.nodeType}: ${entry.part.partId}`, entry] as const)

  it('has a part to check for every opened type', () => {
    for (const definition of OPEN_TYPES) {
      expect(checkedParts.some((entry) => entry.definition === definition), `${definition.nodeType} has no bundled part and no base`).toBe(true)
    }
  })

  it.each(cases)(
    '%s validates as a downloaded part once its id is replaced',
    (_name, { definition, part }) => {
      const checked = validatePartManifest(syntheticOf(part, freshId(part.partId)), 'downloaded')
      expect(checked, JSON.stringify(checked)).toMatchObject({ status: 'ok' })
      if (checked.status === 'ok') expect(checked.usableTypes.map((type) => type.nodeType)).toContain(definition.nodeType)
    },
  )

  it.each(cases)(
    '%s as a downloaded copy behaves exactly as the original',
    (_name, { definition, part, bundled }) => {
      const copyId = freshId(part.partId)
      // A base is a downloaded part itself; a bundled one is already in the catalogue.
      if (!bundled) expect(registerParts([part], 'downloaded')[0], part.partId).toMatchObject({ status: 'added' })
      const original = observe(definition.nodeType, part.partId, part.partId)
      // The comparison means nothing if the part adds nothing to the sketch.
      const catalogueNode = NODE_LIBRARY.find((entry) => entry.type === definition.nodeType)!
      if (catalogueNode.inputs.length + catalogueNode.outputs.length > 0) {
        const graphs = firmwareGraphs(definition.nodeType, namingPart(definition.nodeType, part.partId))
        expect(graphs.some((graph) => generateCpp(graph.nodes, graph.edges) !== generateCpp(
          graph.nodes.filter((entry) => entry.id !== 'part'),
          graph.edges.filter((link) => link.source !== 'part' && link.target !== 'part'),
        )), `${part.partId} adds nothing to the firmware`).toBe(true)
      }

      const [registered] = registerParts([syntheticOf(part, copyId)], 'downloaded')
      expect(registered, JSON.stringify(registered)).toMatchObject({ status: 'added' })
      expect(partOrigin(copyId)).toBe('downloaded')
      expect(PART_CATALOGUE[copyId]).toBeDefined()

      // A part without the block of a block-optional type may be shelved but not offered as one of
      // the type's modules (a passive speaker is not an amplifier). The copy is then held to the
      // original: not offered either, and with no module to compare.
      const block = definition.block ? (part as unknown as Record<string, unknown>)[definition.block] : undefined
      const offered = (id: string) => partOptionsFor(definition.nodeType).some((option) => option.id === id)
      if (definition.blockOptional && block === undefined && !offered(part.partId)) {
        expect(offered(copyId)).toBe(false)
        return
      }

      // The type offers it, resolves it, and does not hold a node that names it.
      expect(partOptionsFor(definition.nodeType).some((option) => option.id === copyId)).toBe(true)
      expect(resolvePartIdentity(definition.nodeType, namingPart(definition.nodeType, copyId))?.entry?.partId).toBe(copyId)
      const named = node('named', definition.nodeType, namingPart(definition.nodeType, copyId))
      expect(unknownPartId(definition.nodeType, named.data.properties)).toBeNull()
      expect(unresolvedNodes([named])).toEqual([])
      // An input type is also listed on the shelf, from its own manifest.
      if (inputPartEntries().some((entry) => entry.nodeType === definition.nodeType && entry.properties?.partId)) {
        expect(inputPartEntries().some((entry) => entry.properties?.partId === copyId)).toBe(true)
      }

      const copy = observe(definition.nodeType, copyId, part.partId)
      const differences = Object.keys(original)
        .map((key) => `${key}: ${firstDifference(copy[key], original[key])}`)
        .filter((line) => !line.endsWith(': same'))
      expect(differences.join('\n'), `${definition.nodeType} ${part.partId}`).toBe('')
    },
  )
})
