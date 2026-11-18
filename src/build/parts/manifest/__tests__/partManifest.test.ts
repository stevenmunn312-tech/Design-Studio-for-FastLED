import { describe, expect, it } from 'vitest'
import { PART_CATALOGUE_DATA } from '../../../generated/partCatalogueData'
import { PART_CATEGORIES_DATA } from '../../../generated/partCategoriesData'
import { PART_OPTIONS } from '../../partOptions'
import { PART_TYPES, partTypeById } from '../../partTypes'
import { validatePartManifest, type PartManifest } from '../partManifest'
import { PART_MANIFEST_VERSION } from '../vocabulary'

const ina219 = PART_CATALOGUE_DATA['adafruit-ina219-current-sensor']

/** A copy of a generated manifest with some fields changed, for the refusal cases. */
function variant(extra: Partial<PartManifest>, base: PartManifest = ina219): PartManifest {
  return { ...base, ...extra }
}

describe('generated part manifests', () => {
  it('are full v1 manifests, valid as bundled parts, usable for exactly the types they name', () => {
    const failures: string[] = []
    for (const [key, manifest] of Object.entries(PART_CATALOGUE_DATA)) {
      if (key !== manifest.partId) failures.push(`${key}: keyed by a different id than ${manifest.partId}`)
      if (manifest.manifestVersion !== PART_MANIFEST_VERSION) failures.push(`${key}: manifestVersion ${manifest.manifestVersion}`)
      const result = validatePartManifest(manifest, 'bundled')
      if (result.status !== 'ok') {
        failures.push(`${key}: ${result.status === 'invalid' ? result.errors.join('; ') : result.reasons.join('; ')}`)
      } else if (result.usableTypes.map((type) => type.nodeType).join() !== manifest.partTypes.join()) {
        failures.push(`${key}: usable ${result.usableTypes.map((type) => type.nodeType).join(',')} of ${manifest.partTypes.join(',')}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('name every node type whose options offer the part', () => {
    const offeredBy = new Map<string, string[]>()
    for (const [nodeType, spec] of Object.entries(PART_OPTIONS)) {
      for (const option of spec.options) offeredBy.set(option.id, [...(offeredBy.get(option.id) ?? []), nodeType])
    }
    const failures: string[] = []
    for (const [partId, manifest] of Object.entries(PART_CATALOGUE_DATA)) {
      for (const nodeType of offeredBy.get(partId) ?? []) {
        if (!manifest.partTypes.includes(nodeType)) failures.push(`${partId}: ${nodeType} offers it but the manifest does not name it`)
      }
      // A part no option row offers still belongs to a type: LED outputs, the data link, the level shifter, the speaker.
      if (!offeredBy.has(partId) && manifest.partTypes.length === 0) failures.push(`${partId}: names no part type`)
    }
    expect(failures).toEqual([])
  })

  it('are published only at reviewed or bench, never drafted', () => {
    const drafted = Object.values(PART_CATALOGUE_DATA).filter((manifest) => manifest.verification === 'drafted')
    expect(drafted.map((manifest) => manifest.partId)).toEqual([])
  })

  it('cite sources, naming manifest fields that exist', () => {
    const failures: string[] = []
    for (const manifest of Object.values(PART_CATALOGUE_DATA)) {
      if (manifest.sources.length === 0) failures.push(`${manifest.partId}: no sources`)
      for (const source of manifest.sources) {
        for (const fact of source.facts) {
          if (!(fact in manifest) && fact !== 'notes') failures.push(`${manifest.partId}: source fact "${fact}" is not a field of the manifest`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('carry the existing option row copy verbatim while those rows remain', () => {
    const failures: string[] = []
    for (const [nodeType, spec] of Object.entries(PART_OPTIONS)) {
      for (const option of spec.options) {
        const manifest = PART_CATALOGUE_DATA[option.id]
        if (!manifest || manifest.partTypes[0] !== nodeType) continue
        if (option.summary !== manifest.copy?.summary) failures.push(`${option.id}: summary differs from its option row`)
        if (option.note !== manifest.copy?.wiringNote) failures.push(`${option.id}: wiring note differs from its option row`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('shelf category tree', () => {
  const ids = new Set(PART_CATEGORIES_DATA.map((category) => category.id))

  it('has unique lowercase-hyphen ids', () => {
    expect(ids.size).toBe(PART_CATEGORIES_DATA.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  it('has every parent present and no cycles', () => {
    const byId = new Map(PART_CATEGORIES_DATA.map((category) => [category.id, category]))
    for (const category of PART_CATEGORIES_DATA) {
      if (category.parent !== null) expect(ids.has(category.parent), `${category.id} -> ${category.parent}`).toBe(true)
      const seen = new Set([category.id])
      for (let parent = category.parent; parent !== null; parent = byId.get(parent)?.parent ?? null) {
        expect(seen.has(parent), `${category.id} reaches ${parent} twice`).toBe(false)
        seen.add(parent)
      }
    }
  })

  it('is used only by ids that exist, and each part sits in at least one category', () => {
    const failures: string[] = []
    for (const manifest of Object.values(PART_CATALOGUE_DATA)) {
      if (manifest.categories.length === 0) failures.push(`${manifest.partId}: no category`)
      for (const id of manifest.categories) if (!ids.has(id)) failures.push(`${manifest.partId}: unknown category ${id}`)
    }
    expect(failures).toEqual([])
  })

  it('splits ultrasonic and time-of-flight distance, and switching by technology', () => {
    const byId = new Map(PART_CATEGORIES_DATA.map((category) => [category.id, category]))
    expect(byId.get('distance-ultrasonic')?.parent).toBe('distance')
    expect(byId.get('distance-time-of-flight')?.parent).toBe('distance')
    expect(PART_CATALOGUE_DATA['hc-sr04-ultrasonic-module'].categories).toEqual(['distance-ultrasonic'])
    expect(PART_CATALOGUE_DATA['adafruit-vl53l0x-distance-sensor'].categories).toEqual(['distance-time-of-flight'])
    for (const id of ['switching-relays', 'switching-ssr', 'switching-mosfet', 'switching-drivers']) {
      expect(byId.get(id)?.parent).toBe('power-switching')
    }
  })
})

describe('part manifest v1', () => {
  it('registers every node type that offers parts', () => {
    const missing = Object.keys(PART_OPTIONS).filter((nodeType) => !partTypeById(nodeType))
    expect(missing).toEqual([])
    expect(new Set(PART_TYPES.map((t) => t.nodeType)).size).toBe(PART_TYPES.length)
  })

  it('refuses a newer manifest format as needing a newer app', () => {
    const result = validatePartManifest(variant({ manifestVersion: PART_MANIFEST_VERSION + 1 }), 'bundled')
    expect(result.status).toBe('needs-newer-app')
  })

  it('refuses an unknown part type rather than guessing one', () => {
    const result = validatePartManifest(variant({ partTypes: ['CanBusInterface'] }), 'bundled')
    expect(result).toMatchObject({ status: 'needs-newer-app', partId: 'adafruit-ina219-current-sensor' })
  })

  it('uses the known type when a part also names one this app lacks', () => {
    const result = validatePartManifest(variant({ partTypes: ['CanBusInterface', 'PowerMonitorInput'] }), 'bundled')
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.usableTypes.map((t) => t.nodeType)).toEqual(['PowerMonitorInput'])
  })

  it('refuses a chip the type cannot drive', () => {
    const manifest = variant({ powerMonitor: { ...ina219.powerMonitor!, device: 'INA260' } })
    expect(validatePartManifest(manifest, 'bundled').status).toBe('needs-newer-app')
  })

  it('refuses an unknown interface or pin role as a newer vocabulary', () => {
    expect(validatePartManifest(variant({ interfaces: ['i3c' as never] }), 'bundled').status).toBe('needs-newer-app')
    expect(validatePartManifest(variant({
      pins: [{ label: 'SDA', role: 'sda' }, { label: 'X', role: 'quantum' as never }],
    }), 'bundled').status).toBe('needs-newer-app')
  })

  it('checks the Build Diagram drawing facts: pads inside the render, a known supply rail', () => {
    const render = ina219.render!
    const pads = ina219.pads!
    expect(validatePartManifest(variant({ pads: [...pads.slice(0, 5), { ...pads[5], xPx: render.widthPx + 1 }] }), 'bundled').status)
      .toBe('invalid')
    expect(validatePartManifest(variant({ pads: pads.slice(0, 3) }), 'bundled').status).toBe('invalid')
    expect(validatePartManifest(variant({ pads: pads.map((pad, i) => i === 0 ? { ...pad, label: 'ZZ' } : pad) }), 'bundled').status)
      .toBe('invalid')
    expect(validatePartManifest(variant({ padHoleRadiusPx: 0 }), 'bundled').status).toBe('invalid')
    expect(validatePartManifest(variant({ padHoleRadiusPx: 7.5, supplyRail: 'v5', powerPadLabel: 'VIN' }), 'bundled').status).toBe('ok')
    expect(validatePartManifest(variant({ supplyRail: 'v48' as never }), 'bundled').status).toBe('needs-newer-app')
    const withoutPads: Partial<PartManifest> = { ...ina219 }
    delete withoutPads.pads
    expect(validatePartManifest(withoutPads as PartManifest, 'bundled').status).toBe('ok')
  })

  it('reports a malformed block as invalid with its path', () => {
    const manifest = variant({ powerMonitor: { ...ina219.powerMonitor!, shuntOhms: Number.NaN } })
    const result = validatePartManifest(manifest, 'bundled')
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errors).toContain('powerMonitor.shuntOhms: expected a finite number')
  })

  it('requires the block its type reads', () => {
    const result = validatePartManifest(variant({ powerMonitor: undefined }), 'bundled')
    expect(result.status).toBe('invalid')
  })

  it('refuses ids that could escape a path or a C++ identifier', () => {
    for (const partId of ['../x', 'Has Space', 'a'.repeat(81), 'semi;colon']) {
      expect(validatePartManifest(variant({ partId }), 'bundled').status).toBe('invalid')
    }
  })

  it('holds a downloaded part to the publishing rules', () => {
    // A type that is not open to downloads is not usable for one, whatever else the part says.
    const type = partTypeById('PowerMonitorInput') as { downloadable: boolean }
    const open = type.downloadable
    type.downloadable = false
    try {
      expect(validatePartManifest(ina219, 'downloaded').status).toBe('needs-newer-app')
    } finally {
      type.downloadable = open
    }
    expect(validatePartManifest(ina219, 'downloaded').status).toBe(open ? 'ok' : 'needs-newer-app')
    expect(validatePartManifest(variant({ verification: 'drafted' }), 'downloaded').status).toBe('invalid')
    expect(validatePartManifest(variant({ sources: [] }), 'downloaded').status).toBe('invalid')
  })

  it('ignores optional fields it does not know, so later additions still load', () => {
    const result = validatePartManifest({ ...ina219, futureField: { x: 1 } }, 'bundled')
    expect(result.status).toBe('ok')
  })
})
