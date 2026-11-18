import { describe, expect, it } from 'vitest'
import { PART_CATALOGUE, type PartCatalogueEntry } from '../../partCatalogue'
import { PART_OPTIONS } from '../../partOptions'
import { PART_TYPES, partTypeById } from '../../partTypes'
import { validatePartManifest, type PartManifest } from '../partManifest'
import { PART_MANIFEST_VERSION } from '../vocabulary'

/** Every node type that offers a catalogued part, keyed by part id. */
function offeringTypes(): Map<string, string[]> {
  const byPart = new Map<string, string[]>()
  for (const [nodeType, spec] of Object.entries(PART_OPTIONS)) {
    for (const option of spec.options) byPart.set(option.id, [...(byPart.get(option.id) ?? []), nodeType])
  }
  return byPart
}

function asManifest(entry: PartCatalogueEntry, partTypes: string[], extra: Partial<PartManifest> = {}): PartManifest {
  return {
    ...entry,
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    partTypes,
    categories: [],
    verification: 'reviewed',
    sources: [],
    ...extra,
  }
}

const ina219 = PART_CATALOGUE['adafruit-ina219-current-sensor']

describe('part manifest v1', () => {
  it('accepts every bundled part as a bundled manifest for each type that offers it', () => {
    const failures: string[] = []
    for (const [partId, types] of offeringTypes()) {
      const entry = PART_CATALOGUE[partId]
      if (!entry) continue
      const result = validatePartManifest(asManifest(entry, types), 'bundled')
      if (result.status !== 'ok') {
        failures.push(`${partId}: ${result.status === 'invalid' ? result.errors.join('; ') : result.reasons.join('; ')}`)
      } else if (result.usableTypes.length !== types.length) {
        failures.push(`${partId}: usable ${result.usableTypes.map((t) => t.nodeType).join(',')} of ${types.join(',')}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('registers every node type that offers parts', () => {
    const missing = Object.keys(PART_OPTIONS).filter((nodeType) => !partTypeById(nodeType))
    expect(missing).toEqual([])
    expect(new Set(PART_TYPES.map((t) => t.nodeType)).size).toBe(PART_TYPES.length)
  })

  it('refuses a newer manifest format as needing a newer app', () => {
    const result = validatePartManifest(asManifest(ina219, ['PowerMonitorInput'], { manifestVersion: PART_MANIFEST_VERSION + 1 }), 'bundled')
    expect(result.status).toBe('needs-newer-app')
  })

  it('refuses an unknown part type rather than guessing one', () => {
    const result = validatePartManifest(asManifest(ina219, ['CanBusInterface']), 'bundled')
    expect(result).toMatchObject({ status: 'needs-newer-app', partId: 'adafruit-ina219-current-sensor' })
  })

  it('uses the known type when a part also names one this app lacks', () => {
    const result = validatePartManifest(asManifest(ina219, ['CanBusInterface', 'PowerMonitorInput']), 'bundled')
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.usableTypes.map((t) => t.nodeType)).toEqual(['PowerMonitorInput'])
  })

  it('refuses a chip the type cannot drive', () => {
    const entry = { ...ina219, powerMonitor: { ...ina219.powerMonitor!, device: 'INA260' } }
    expect(validatePartManifest(asManifest(entry, ['PowerMonitorInput']), 'bundled').status).toBe('needs-newer-app')
  })

  it('refuses an unknown interface or pin role as a newer vocabulary', () => {
    expect(validatePartManifest(asManifest(ina219, ['PowerMonitorInput'], {
      interfaces: ['i3c' as never],
    }), 'bundled').status).toBe('needs-newer-app')
    expect(validatePartManifest(asManifest(ina219, ['PowerMonitorInput'], {
      pins: [{ label: 'SDA', role: 'sda' }, { label: 'X', role: 'quantum' as never }],
    }), 'bundled').status).toBe('needs-newer-app')
  })

  it('reports a malformed block as invalid with its path', () => {
    const entry = { ...ina219, powerMonitor: { ...ina219.powerMonitor!, shuntOhms: Number.NaN } }
    const result = validatePartManifest(asManifest(entry, ['PowerMonitorInput']), 'bundled')
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errors).toContain('powerMonitor.shuntOhms: expected a finite number')
  })

  it('requires the block its type reads', () => {
    const entry: PartCatalogueEntry = { ...ina219, powerMonitor: undefined }
    const result = validatePartManifest(asManifest(entry, ['PowerMonitorInput']), 'bundled')
    expect(result.status).toBe('invalid')
  })

  it('refuses ids that could escape a path or a C++ identifier', () => {
    for (const partId of ['../x', 'Has Space', 'a'.repeat(81), 'semi;colon']) {
      expect(validatePartManifest(asManifest({ ...ina219, partId }, ['PowerMonitorInput']), 'bundled').status).toBe('invalid')
    }
  })

  it('holds a downloaded part to the publishing rules', () => {
    const published = asManifest(ina219, ['PowerMonitorInput'], {
      sources: [{ facts: ['dimensionsMm'], ref: 'https://example.invalid/ina219.pdf' }],
    })
    // No type is open to downloads until its audit in phase A step 3.
    expect(validatePartManifest(published, 'downloaded').status).toBe('needs-newer-app')
    expect(validatePartManifest({ ...published, verification: 'drafted' }, 'downloaded').status).toBe('invalid')
    expect(validatePartManifest({ ...published, sources: [] }, 'downloaded').status).toBe('invalid')
  })

  it('ignores optional fields it does not know, so later additions still load', () => {
    const result = validatePartManifest({ ...asManifest(ina219, ['PowerMonitorInput']), futureField: { x: 1 } }, 'bundled')
    expect(result.status).toBe('ok')
  })
})
