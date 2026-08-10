import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../boardProfiles'
import { bomCsv, buildBomRows, buildConnectionRows, connectionsCsv, rowsToCsv } from '../buildExports'
import { ensureBuildProfile } from '../buildProfile'
import { calculateElectricalPlan } from '../electricalPlan'
import { buildHardwareManifest } from '../hardwareManifest'
import type { StudioNode } from '../../state/graphStore'

function outputNode(): StudioNode {
  return {
    id: 'out',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Matrix Output',
      nodeType: 'MatrixOutput',
      category: 'output',
      properties: { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 },
      inputs: [],
      outputs: [],
    },
  } as unknown as StudioNode
}

describe('buildExports', () => {
  it('quotes CSV fields safely', () => {
    expect(rowsToCsv(['A', 'B'], [['plain', 'with, comma'], ['with "quote"', 'line\nbreak']]))
      .toBe('A,B\r\nplain,"with, comma"\r\n"with ""quote""","line\nbreak"')
  })

  it('generates matching connection and BOM rows from the manifest and plan', () => {
    const manifest = buildHardwareManifest([outputNode()], [], 'esp32:esp32:esp32s3')
    const profile = ensureBuildProfile({
      version: 1,
      physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      controllerPower: { preferredPath: 'usb' },
      outputs: {
        'output:out': {
          physicalLengthMm: 2500,
          ledDensityPerMeter: 60,
          feedCableLengthMm: 500,
          manualInjectionPoints: ['0', '2500'],
        },
      },
    })
    const board = boardProfileById(profile.physicalBoardProfileId ?? '')
    const plan = calculateElectricalPlan(manifest, profile, board)
    const connectionRows = buildConnectionRows(manifest.primaryItems, plan, board)
    const bomRows = buildBomRows(manifest, plan, profile, board)

    expect(connectionRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromTerminal: 'GPIO14', to: '74AHCT125 level shifter 1', toTerminal: 'A1' }),
      expect.objectContaining({ from: '74AHCT125 level shifter 1', fromTerminal: 'Y1', purpose: '5 V conditioned LED data' }),
      expect.objectContaining({ from: '5 V PSU 1 fused distribution', purpose: '3840 mA protected branch' }),
      expect.objectContaining({ to: 'Matrix Output center injection @ 2134 mm', toTerminal: '+5V' }),
      expect.objectContaining({ purpose: 'Local high-frequency decoupling', toTerminal: '+' }),
    ]))
    expect(bomRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: 'Matrix Output start @ 0 mm branch fuse', status: 'calculated' }),
      expect.objectContaining({ quantity: '3', item: 'Local ceramic decoupling capacitor' }),
      expect.objectContaining({ item: '5 V DC power supply 1', specification: expect.stringContaining('20% headroom'), status: 'calculated' }),
      expect.objectContaining({ item: 'supply-1 bulk electrolytic capacitor', status: 'calculated' }),
    ]))
    expect(connectionsCsv(connectionRows)).toContain('Common ground reference')
    expect(bomCsv(bomRows)).toContain('Matrix Output center @ 2134 mm branch fuse')
    expect(connectionsCsv(connectionRows, { status: 'Draft - unresolved', ruleSetVersion: 'rules-v1' }))
      .toContain('Export status,Rule set')
    expect(bomCsv(bomRows, { status: 'Draft - unresolved', ruleSetVersion: 'rules-v1' }))
      .toContain('Draft - unresolved,rules-v1')
  })
})
