import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../../../build/boards/boardProfiles'
import { buildBomRows, buildConnectionRows } from '../../../build/buildExports'
import { ensureBuildProfile } from '../../../build/buildProfile'
import { calculateElectricalPlan } from '../../../build/power/electricalPlan'
import { buildHardwareManifest } from '../../../build/hardwareManifest'
import {
  itemLayouts,
  OUTPUT_CARD_HEIGHT,
  OUTPUT_DATA_EXTENDER_HEIGHT,
  outputHasDataExtender,
} from '../../../components/BuildDiagram/physicalDiagramLayout'
import type { StudioNode } from '../../graphStore'
import { isPropertyEnabled, propertyOptions, selectOptionLabel } from '../../nodeLibrary'
import { conductorCountWord, conductorPhrase, dataLinkPartIds, dataLinkSpec } from '../pixelDataExtender'

// A test may name a bundled part; the code under test may not.
const NLED_PAIR = 'nled-pixel-data-extender-pair'

function outputNode(extra: Record<string, unknown> = {}): StudioNode {
  return {
    id: 'out',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'LED Matrix',
      nodeType: 'MatrixOutput',
      category: 'output',
      properties: { form: 'matrix', width: 16, height: 16, chipset: 'WS2812B', dataPin: 14, ...extra },
      inputs: [],
      outputs: [],
    },
  } as unknown as StudioNode
}

const S3 = 'esp32:esp32:esp32s3'

describe('NLED pixel data extender', () => {
  it('reads its link facts from the imported part, not restated numbers', () => {
    const spec = dataLinkSpec({ dataLinkPartId: NLED_PAIR })
    expect(spec?.pairConductors).toEqual(['A', 'B', 'GND'])
    expect(spec?.maxDistanceMeters).toBeGreaterThan(0)
  })

  it('adds the TX/RX pair to the output only when chosen', () => {
    const direct = buildHardwareManifest([outputNode()], [], S3).primaryItems[0]
    expect(direct.facts.dataLinkPartId).toBeUndefined()
    expect(outputHasDataExtender(direct)).toBe(false)

    const extended = buildHardwareManifest([outputNode({ dataLinkPartId: NLED_PAIR })], [], S3).primaryItems[0]
    expect(extended.facts.dataLinkPartId).toBe(NLED_PAIR)
    expect(extended.subtitle).toContain('differential link')
    expect(outputHasDataExtender(extended)).toBe(true)
  })

  it('makes room on the sheet for the pair below the fixture', () => {
    const [direct] = itemLayouts(buildHardwareManifest([outputNode()], [], S3).primaryItems)
    const [extended] = itemLayouts(buildHardwareManifest([outputNode({ dataLinkPartId: NLED_PAIR })], [], S3).primaryItems)
    expect(direct.height).toBe(OUTPUT_CARD_HEIGHT)
    expect(extended.height).toBe(OUTPUT_CARD_HEIGHT + OUTPUT_DATA_EXTENDER_HEIGHT)
  })

  it('routes data through the transmitter, the twisted run and the receiver', () => {
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const manifest = buildHardwareManifest([outputNode({ dataLinkPartId: NLED_PAIR })], [], S3)
    const profile = ensureBuildProfile({ version: 1 })
    const plan = calculateElectricalPlan(manifest, profile, board)
    const rows = buildConnectionRows(manifest.primaryItems, plan, board)
    const tx = rows.find((row) => row.fromTerminal === 'Output' && row.toTerminal === 'DATA')
    expect(tx?.to).toMatch(/TX$/)
    for (const conductor of ['A', 'B', 'GND']) {
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ fromTerminal: conductor, toTerminal: conductor, to: expect.stringMatching(/RX$/) }),
      ]))
    }
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: expect.stringMatching(/RX$/), fromTerminal: 'DATA', to: 'LED Matrix', toTerminal: 'DIN' }),
    ]))
    // The resistor no longer lands on DIN directly.
    expect(rows.some((row) => row.fromTerminal === 'Output' && row.toTerminal === 'DIN')).toBe(false)

    const bom = buildBomRows(manifest, plan, profile, board)
    expect(bom).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: '1', item: 'NLED Pixel Data Extender TX/RX pair' }),
      expect.objectContaining({ item: 'Differential pixel-data cable' }),
    ]))
  })

  it('keeps the field editable while it names an extender a chipset change invalidated', () => {
    expect(isPropertyEnabled('MatrixOutput', 'dataLinkPartId', { chipset: 'WS2812B' })).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'dataLinkPartId', { chipset: 'APA102' })).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'dataLinkPartId', { chipset: 'APA102', dataLinkPartId: NLED_PAIR })).toBe(true)
  })

  it('offers the link parts the catalogue holds, and Direct as the empty choice', () => {
    expect(dataLinkPartIds()).toContain(NLED_PAIR)
    const options = propertyOptions('MatrixOutput', 'dataLinkPartId', {})
    expect(options[0]).toBe('')
    expect(options).toContain(NLED_PAIR)
    expect(selectOptionLabel('MatrixOutput', 'dataLinkPartId', '')).toBe('Direct')
    expect(selectOptionLabel('MatrixOutput', 'dataLinkPartId', NLED_PAIR)).toBe('NLED Pixel Data Extender TX/RX pair')
  })

  it('reads a link nobody holds as no link, never as another part', () => {
    expect(dataLinkSpec({ dataLinkPartId: 'no-such-extender' })).toBeNull()
    expect(dataLinkSpec({ dataLinkPartId: '' })).toBeNull()
    // A save from before the property was renamed reads as Direct, with no note.
    expect(dataLinkSpec({ dataLink: 'NLED Pixel Data Extender' })).toBeNull()
    const item = buildHardwareManifest([outputNode({ dataLinkPartId: 'no-such-extender' })], [], S3).primaryItems[0]
    expect(outputHasDataExtender(item)).toBe(false)
  })

  it('words the conductors from the part rather than restating them', () => {
    expect(conductorPhrase(['A', 'B', 'GND'])).toBe('A, B and common ground')
    expect(conductorPhrase(['A', 'B'])).toBe('A and B')
    expect(conductorCountWord(3)).toBe('Three')
  })
})
