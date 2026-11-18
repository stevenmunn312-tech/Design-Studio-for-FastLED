import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { inputPartEntries, FIXTURE_PARTS } from '../hardwarePartCatalog'
import { useBenchParts } from '../useBenchParts'
import {
  PART_CATALOGUE, bundledPartsForType, registerParts, resetRegisteredPartsForTests,
} from '../../../build/parts/partCatalogue'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import { libraryDefaults, NODE_LIBRARY } from '../../../state/nodeLibrary'
import type { StudioNode } from '../../../state/graphStore'
import type { PartManifest } from '../../../build/parts/manifest/partManifest'
import { PART_MANIFEST_VERSION } from '../../../build/parts/manifest/vocabulary'

afterEach(() => resetRegisteredPartsForTests())

const CATALOGUE_INPUT_TYPES = [
  'LightInput', 'TouchButtonInput', 'PowerMonitorInput', 'EnvironmentInput', 'MotionVectorInput',
  'TouchPadInput', 'JoystickInput', 'DistanceInput', 'TemperatureInput', 'PresenceInput', 'EncoderInput',
]

/** A valid manifest built from a bundled part, under a new id. */
function copyOf(source: string, partId: string, partType: string, extra: Partial<PartManifest> = {}): PartManifest {
  const entry = JSON.parse(JSON.stringify(PART_CATALOGUE[source])) as PartManifest
  const copy = { ...entry.copy }
  delete copy.optionLabel
  delete copy.optionOrder
  return {
    ...entry,
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    partTypes: [partType],
    categories: [],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    copy,
    ...extra,
  }
}

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      nodeType,
      category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs,
      outputs: definition.outputs,
    },
  } as StudioNode
}

function benchInputs(nodes: StudioNode[]) {
  const { result } = renderHook(() => useBenchParts({
    nodes, edges: [], selectedBoard: boardProfileById('esp32-generic-devkit-38pin'),
  }))
  return result.current.inputParts
}

describe('shelf entries derived from the catalogue', () => {
  it('lists every bundled part of the catalogue-derived input types from its manifest', () => {
    for (const nodeType of CATALOGUE_INPUT_TYPES) {
      const entries = inputPartEntries().filter((entry) => entry.nodeType === nodeType && entry.properties?.partId)
      const bundled = bundledPartsForType(nodeType)
      expect(entries.map((entry) => entry.properties!.partId), nodeType).toEqual(bundled.map((part) => part.partId))
      entries.forEach((entry, index) => {
        const manifest = bundled[index]
        expect(entry.label, manifest.partId).toBe(manifest.label)
        expect(entry.hint, manifest.partId).toBe(manifest.copy?.summary)
        expect(entry.footprint, manifest.partId).toEqual(manifest.dimensionsMm)
      })
    }
  })

  it('takes the default fixture footprints from the catalogue, with no literal stand-in', () => {
    const pd = FIXTURE_PARTS.find((entry) => entry.nodeType === 'PdTriggerSource')!
    expect(pd.footprint).toEqual(PART_CATALOGUE['zy12pdn-usb-c-pd-trigger'].dimensionsMm)
  })

  it('shelves a registered part of such a type from its own manifest, pins by its interface', () => {
    registerParts([
      copyOf('adafruit-vl53l1x-distance-sensor', 'extra-laser', 'DistanceInput', {
        dimensionsMm: { width: 12.5, height: 9 },
        copy: { summary: 'A new laser ranger' },
      }),
      copyOf('hc-sr04-ultrasonic-module', 'extra-pulse', 'DistanceInput'),
    ], 'bundled')
    const laser = inputPartEntries().find((entry) => entry.properties?.partId === 'extra-laser')!
    expect(laser).toMatchObject({
      nodeType: 'DistanceInput', label: 'Test extra-laser', hint: 'A new laser ranger',
      footprint: { width: 12.5, height: 9 },
    })
    expect(laser.pinFields.map((field) => field.key)).toEqual(['sdaPin', 'sclPin'])
    const pulse = inputPartEntries().find((entry) => entry.properties?.partId === 'extra-pulse')!
    expect(pulse.pinFields.map((field) => field.key)).toEqual(['trigPin', 'echoPin'])
    // A layout id never collides with a bundled part's.
    const ids = inputPartEntries().map((entry) => entry.partId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('bench parts for a node that names a part', () => {
  it('draws a node that names a bundled part with that part', () => {
    const [part] = benchInputs([node('a', 'DistanceInput', { partId: 'adafruit-vl53l0x-distance-sensor' })])
    expect(part.entry.properties?.partId).toBe('adafruit-vl53l0x-distance-sensor')
  })

  it('draws a registered part with its own entry, not the type\'s first bundled one', () => {
    registerParts([copyOf('hc-sr04-ultrasonic-module', 'extra-pir', 'DistanceInput')], 'bundled')
    const [part] = benchInputs([node('a', 'DistanceInput', { partId: 'extra-pir' })])
    expect(part.entry.properties?.partId).toBe('extra-pir')
  })

  it('draws nothing for a part the catalogue does not hold, rather than the first bundled one', () => {
    for (const nodeType of ['DistanceInput', 'TemperatureInput', 'MotionInput', 'PowerMonitorInput']) {
      expect(benchInputs([node('a', nodeType, { partId: 'not-downloaded-yet' })]), nodeType).toEqual([])
    }
  })

  it('still draws a node that names no part as its type\'s default', () => {
    const [part] = benchInputs([node('a', 'DistanceInput', { partId: '' })])
    expect(part.entry.properties?.partId).toBe(bundledPartsForType('DistanceInput')[0].partId)
    expect(benchInputs([node('b', 'ButtonBank')])).toHaveLength(1)
  })
})
