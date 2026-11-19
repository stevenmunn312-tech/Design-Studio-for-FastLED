import { describe, expect, it } from 'vitest'
import { PART_CATALOGUE, partById } from '../partCatalogue'
import { validatePartManifest } from '../manifest/partManifest'
import { ledOutputBlockIssue } from '../manifest/ledOutputBlock'
import { partTypeById, partTypeDrivesDevice } from '../partTypes'
import { CHIPSET_OPTIONS } from '../../../state/nodeLibrary'

const strip = { form: 'strip', chipset: 'WS2812B', colorOrder: 'GRB', supplyVolts: 5, fullWhiteMa: 60, pitchMm: 16.7, maxCount: 240, cutEvery: 1 }
const ring = { form: 'ring', chipset: 'WS2812B', colorOrder: 'GRB', supplyVolts: 5, fullWhiteMa: 60, count: 24, diameterMm: 65.5 }
const matrix = { form: 'matrix', chipset: 'WS2812B', colorOrder: 'GRB', supplyVolts: 5, fullWhiteMa: 60, pitchMm: 10, width: 16, height: 16 }
const hub75 = { form: 'hub75', chipset: 'HUB75', supplyVolts: 5, fullWhiteMa: 1.62, pitchMm: 4, width: 64, height: 64, scan: 16 }

describe('the ledOutput block', () => {
  it('accepts a cut strip, a ring, a matrix and a HUB75 panel', () => {
    for (const block of [strip, ring, matrix, hub75]) expect(ledOutputBlockIssue(block)).toBeNull()
  })

  it('needs the size its form is measured by', () => {
    expect(ledOutputBlockIssue({ ...strip, maxCount: undefined, cutEvery: undefined })).toMatch(/count/)
    expect(ledOutputBlockIssue({ ...strip, count: 30 })).toMatch(/fixed length/)
    expect(ledOutputBlockIssue({ ...strip, maxCount: 10, cutEvery: 3 })).toMatch(/cut units/)
    expect(ledOutputBlockIssue({ ...strip, cutEvery: 3, maxCount: 240 })).toBeNull()
    expect(ledOutputBlockIssue({ ...matrix, height: undefined })).toMatch(/width and height/)
    expect(ledOutputBlockIssue({ ...matrix, count: 4 })).toMatch(/not a count/)
    expect(ledOutputBlockIssue({ ...ring, diameterMm: undefined })).toMatch(/diameter/)
    expect(ledOutputBlockIssue({ ...strip, diameterMm: 10 })).toMatch(/ring/)
    expect(ledOutputBlockIssue({ ...strip, width: 4 })).toMatch(/no width/)
  })

  it('ties HUB75 to its chipset, its scan and no colour order', () => {
    expect(ledOutputBlockIssue({ ...hub75, chipset: 'WS2812B' })).toMatch(/HUB75/)
    expect(ledOutputBlockIssue({ ...matrix, chipset: 'HUB75' })).toMatch(/HUB75/)
    expect(ledOutputBlockIssue({ ...hub75, scan: undefined })).toMatch(/scan/)
    expect(ledOutputBlockIssue({ ...matrix, scan: 16 })).toMatch(/scan/)
    expect(ledOutputBlockIssue({ ...matrix, colorOrder: undefined })).toMatch(/colour order/)
  })

  it('needs a pitch except on a ring, and a supply the power plan knows', () => {
    expect(ledOutputBlockIssue({ ...strip, pitchMm: undefined })).toMatch(/pitch/)
    expect(ledOutputBlockIssue({ ...ring, pitchMm: undefined })).toBeNull()
    expect(ledOutputBlockIssue({ ...strip, supplyVolts: 9 })).toMatch(/supplyVolts/)
  })
})

describe('an LED product manifest', () => {
  const manifest = (ledOutput: unknown, over: Record<string, unknown> = {}) => ({
    ...partById('ws2812b-ring-24')!, ledOutput, ...over,
  })

  it('validates for every bundled LED part and names a type that drives its chipset', () => {
    const type = partTypeById('MatrixOutput')!
    expect(type.block).toBe('ledOutput')
    expect(type.devices).toEqual(CHIPSET_OPTIONS)
    expect(type.downloadable).toBe(true)
    for (const entry of Object.values(PART_CATALOGUE)) {
      if (!entry.ledOutput) continue
      expect(partTypeDrivesDevice(type, { chipset: entry.ledOutput.chipset }), entry.partId).toBe(true)
      expect(validatePartManifest(entry, 'bundled').status, entry.partId).toBe('ok')
    }
  })

  it('refuses a block that breaks its field shapes or its cross rules', () => {
    const bad = validatePartManifest(manifest({ ...ring, fullWhiteMa: -1 }), 'bundled')
    expect(bad.status).toBe('invalid')
    const rule = validatePartManifest(manifest({ ...ring, count: undefined }), 'bundled')
    expect(rule).toMatchObject({ status: 'invalid' })
    expect(JSON.stringify(rule)).toMatch(/ledOutput: needs count/)
    expect(validatePartManifest(manifest({ ...ring, colorOrder: 'XYZ' }), 'bundled').status).toBe('invalid')
  })

  it('waits for a newer app when the chipset is not one this version drives', () => {
    expect(validatePartManifest(manifest({ ...ring, chipset: 'NEWCHIP9000' }), 'bundled'))
      .toMatchObject({ status: 'needs-newer-app' })
  })

  it('no longer carries a top-level ledLayout', () => {
    for (const entry of Object.values(PART_CATALOGUE)) expect(entry, entry.partId).not.toHaveProperty('ledLayout')
  })

  it('keeps the datasheet facts for each bundled LED part, with a source naming them', () => {
    for (const entry of Object.values(PART_CATALOGUE)) {
      if (!entry.ledOutput) continue
      const manifest = entry as unknown as { sources: Array<{ facts: string[]; ref: string }> }
      expect(manifest.sources.some((source) => source.facts.includes('ledOutput')), entry.partId).toBe(true)
      expect(entry.ledOutput.fullWhiteMa, entry.partId).toBeGreaterThan(0)
    }
    expect(partById('ws2812b-strip')!.ledOutput).toMatchObject({ maxCount: 240, cutEvery: 1, fullWhiteMa: 60 })
    expect(partById('ws2812b-strip')!.ledOutput).not.toHaveProperty('count')
  })
})
