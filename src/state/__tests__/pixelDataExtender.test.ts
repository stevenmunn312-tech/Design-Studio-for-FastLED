import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../../build/boardProfiles'
import { buildBomRows, buildConnectionRows } from '../../build/buildExports'
import { ensureBuildProfile } from '../../build/buildProfile'
import { calculateElectricalPlan } from '../../build/electricalPlan'
import { buildHardwareManifest } from '../../build/hardwareManifest'
import {
  itemLayouts,
  OUTPUT_CARD_HEIGHT,
  OUTPUT_DATA_EXTENDER_HEIGHT,
  outputHasDataExtender,
} from '../../components/BuildDiagram/physicalDiagramLayout'
import type { StudioNode } from '../graphStore'
import { isPropertyEnabled } from '../nodeLibrary'
import {
  DIRECT_PIXEL_DATA_LINK,
  NLED_PIXEL_DATA_EXTENDER_PART_ID,
  NLED_PIXEL_DATA_LINK,
  nledPixelDataExtenderSpec,
} from '../pixelDataExtender'

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
    const spec = nledPixelDataExtenderSpec()
    expect(spec?.pairConductors).toEqual(['A', 'B', 'GND'])
    expect(spec?.maxDistanceMeters).toBeGreaterThan(0)
  })

  it('adds the TX/RX pair to the output only when chosen', () => {
    const direct = buildHardwareManifest([outputNode()], [], S3).primaryItems[0]
    expect(direct.facts.dataLink).toBe(DIRECT_PIXEL_DATA_LINK)
    expect(outputHasDataExtender(direct)).toBe(false)

    const extended = buildHardwareManifest([outputNode({ dataLink: NLED_PIXEL_DATA_LINK })], [], S3).primaryItems[0]
    expect(extended.facts.dataLinkPartId).toBe(NLED_PIXEL_DATA_EXTENDER_PART_ID)
    expect(extended.subtitle).toContain('differential link')
    expect(outputHasDataExtender(extended)).toBe(true)
  })

  it('makes room on the sheet for the pair below the fixture', () => {
    const [direct] = itemLayouts(buildHardwareManifest([outputNode()], [], S3).primaryItems)
    const [extended] = itemLayouts(buildHardwareManifest([outputNode({ dataLink: NLED_PIXEL_DATA_LINK })], [], S3).primaryItems)
    expect(direct.height).toBe(OUTPUT_CARD_HEIGHT)
    expect(extended.height).toBe(OUTPUT_CARD_HEIGHT + OUTPUT_DATA_EXTENDER_HEIGHT)
  })

  it('routes data through the transmitter, the twisted run and the receiver', () => {
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const manifest = buildHardwareManifest([outputNode({ dataLink: NLED_PIXEL_DATA_LINK })], [], S3)
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
    expect(isPropertyEnabled('MatrixOutput', 'dataLink', { chipset: 'WS2812B' })).toBe(true)
    expect(isPropertyEnabled('MatrixOutput', 'dataLink', { chipset: 'APA102' })).toBe(false)
    expect(isPropertyEnabled('MatrixOutput', 'dataLink', { chipset: 'APA102', dataLink: NLED_PIXEL_DATA_LINK })).toBe(true)
  })
})
