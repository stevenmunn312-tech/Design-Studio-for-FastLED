import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../boardProfiles'
import { ensureBuildProfile } from '../buildProfile'
import { calculateElectricalPlan } from '../electricalPlan'
import { buildHardwareManifest } from '../hardwareManifest'
import type { StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType === 'MatrixOutput' ? 'Matrix Output' : nodeType,
      nodeType,
      category: nodeType === 'MatrixOutput' ? 'output' : 'input',
      properties,
      inputs: [],
      outputs: [],
    },
  } as unknown as StudioNode
}

describe('electricalPlan', () => {
  it('stays blocked while exact-board, controller-power, and install facts are missing', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
    ], [], 'esp32:esp32:esp32s3')

    const plan = calculateElectricalPlan(manifest, ensureBuildProfile(undefined), undefined)

    expect(plan.status).toBe('blocked')
    expect(plan.requirementsCalculatedText).toBe('blocked by 5 missing planner inputs')
    expect(plan.blockers.map((entry) => entry.id)).toEqual([
      'exact-board',
      'controller-power',
      'output:out:length',
      'output:out:density',
      'output:out:feed',
    ])
    expect(plan.outputs).toHaveLength(0)
  })

  it('calculates a conservative WS2812-class supply summary once the required facts are present', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', {
        width: 16,
        height: 16,
        chipset: 'WS2812B',
        dataPin: 14,
        powerLimit: true,
        milliamps: 9000,
      }),
    ], [], 'esp32:esp32:esp32s3')

    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({
      version: 1,
      physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      controllerPower: { preferredPath: 'usb' },
      outputs: {
        'output:out': {
          physicalLengthMm: 2500,
          ledDensityPerMeter: 60,
          feedCableLengthMm: 500,
          intendedFeedLocation: 'start',
          topology: 'matrix',
        },
      },
    }), boardProfileById('espressif-esp32-s3-devkitc-1'))

    expect(plan.status).toBe('calculated')
    expect(plan.requirementsCalculatedText).toContain('calculated with build-rules-')
    expect(plan.controllerPowerPath).toBe('USB power')
    expect(plan.blockers).toHaveLength(0)
    expect(plan.outputs).toEqual([
      expect.objectContaining({
        itemId: 'output:out',
        pixelCount: 256,
        physicalLengthMm: 2500,
        estimatedDensityPerMeter: 60,
        estimatedPitchMm: 16.7,
        currentPerMeterMa: 3600,
        designCurrentMa: 15360,
        operatingCurrentCapMa: 9000,
        recommendedSupplyCurrentMa: 19200,
        recommendedSupplyWattage: 96,
        conductor: expect.objectContaining({ awg: 14, crossSectionMm2: 2 }),
        connectorMinimumMa: 30000,
        fuse: expect.objectContaining({ ratingMa: 25000 }),
      }),
    ])
    expect(plan.totals).toEqual(expect.objectContaining({
      designCurrentMa: 15360,
      operatingCurrentCapMa: 9000,
      recommendedSupplyCurrentMa: 19200,
      recommendedSupplyWattage: 96,
      nominalVoltage: 5,
      headroomPercent: 25,
    }))
    expect(plan.unresolved).toHaveLength(1)
    expect(plan.unresolved[0]).toContain('injection spacing')
  })

  it('keeps Power ready pending until owned LED supplies are declared', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
    ], [], 'esp32:esp32:esp32s3')

    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({
      version: 1,
      physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      controllerPower: { preferredPath: 'usb' },
      outputs: {
        'output:out': {
          physicalLengthMm: 2500,
          ledDensityPerMeter: 60,
          feedCableLengthMm: 500,
        },
      },
    }), boardProfileById('espressif-esp32-s3-devkitc-1'))

    expect(plan.status).toBe('calculated')
    expect(plan.powerReadyText).toBe('needs review: 6 power-path issues')
    expect(plan.supplyChecks).toEqual([])
  })

  it('validates assigned owned supplies against the conservative branch budget', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
    ], [], 'esp32:esp32:esp32s3')

    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({
      version: 1,
      physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      controllerPower: { preferredPath: 'usb' },
      outputs: {
        'output:out': {
          physicalLengthMm: 2500,
          ledDensityPerMeter: 60,
          feedCableLengthMm: 500,
        },
      },
      ownedParts: {
        supplies: {
          'supply-1': {
            id: 'supply-1',
            label: 'Bench 5V',
            voltage: 5,
            continuousCurrentMa: 20000,
            wattage: 100,
          },
        },
        supplyAssignments: {
          'output:out': 'supply-1',
        },
      },
    }), boardProfileById('espressif-esp32-s3-devkitc-1'))

    expect(plan.powerReadyText).toBe('needs review: 4 power-path issues')
    expect(plan.supplyChecks).toEqual([
      expect.objectContaining({
        supplyId: 'supply-1',
        label: 'Bench 5V',
        requiredVoltage: 5,
        requiredCurrentMa: 19200,
        requiredWattage: 96,
        declaredVoltage: 5,
        declaredCurrentMa: 20000,
        declaredWattage: 100,
        issues: [],
      }),
    ])
  })

  it('flags assigned owned supplies that do not meet voltage or current requirements', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
    ], [], 'esp32:esp32:esp32s3')

    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({
      version: 1,
      physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      controllerPower: { preferredPath: 'usb' },
      outputs: {
        'output:out': {
          physicalLengthMm: 2500,
          ledDensityPerMeter: 60,
          feedCableLengthMm: 500,
        },
      },
      ownedParts: {
        supplies: {
          'supply-1': {
            id: 'supply-1',
            label: 'Tiny 12V Brick',
            voltage: 12,
            continuousCurrentMa: 5000,
            wattage: 40,
          },
        },
        supplyAssignments: {
          'output:out': 'supply-1',
        },
      },
    }), boardProfileById('espressif-esp32-s3-devkitc-1'))

    expect(plan.powerReadyText).toBe('needs review: 7 power-path issues')
    expect(plan.supplyChecks[0]?.issues.map((issue) => issue.id)).toEqual([
      'supply-1:voltage',
      'supply-1:current',
      'supply-1:wattage',
    ])
  })

  it('prefers the Build Diagram operating-current cap over the node-derived cap', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', {
        width: 16,
        height: 16,
        chipset: 'WS2812B',
        dataPin: 14,
        powerLimit: true,
        milliamps: 9000,
      }),
    ], [], 'esp32:esp32:esp32s3')

    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({
      version: 1,
      physicalBoardProfileId: 'espressif-esp32-s3-devkitc-1',
      controllerPower: { preferredPath: 'usb' },
      outputs: {
        'output:out': {
          physicalLengthMm: 2500,
          ledDensityPerMeter: 60,
          feedCableLengthMm: 500,
          desiredCurrentCapMa: 7500,
        },
      },
    }), boardProfileById('espressif-esp32-s3-devkitc-1'))

    expect(plan.outputs[0]?.operatingCurrentCapMa).toBe(7500)
    expect(plan.totals?.operatingCurrentCapMa).toBe(7500)
  })

  it('passes Power ready only when the complete declared branch meets the calculated plan', () => {
    const manifest = buildHardwareManifest([
      node('out', 'MatrixOutput', { width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 }),
    ], [], 'esp32:esp32:esp32s3')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({
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
      ownedParts: {
        supplies: { psu: { id: 'psu', voltage: 5, continuousCurrentMa: 20000, wattage: 100 } },
        wires: { wire: { id: 'wire', gaugeAwg: 14, crossSectionMm2: 2, conductorMaterial: 'copper' } },
        connectors: { connector: { id: 'connector', continuousCurrentMa: 30000 } },
        fuses: { fuse: { id: 'fuse', ratingMa: 25000 } },
        supplyAssignments: { 'output:out': 'psu' },
        wireAssignments: { 'output:out': 'wire' },
        connectorAssignments: { 'output:out': 'connector' },
        fuseAssignments: { 'output:out': 'fuse' },
      },
    }), boardProfileById('espressif-esp32-s3-devkitc-1'))

    expect(plan.branchChecks[0]?.issues).toEqual([])
    expect(plan.supplyChecks[0]?.issues).toEqual([])
    expect(plan.powerReadyPasses).toBe(true)
    expect(plan.powerReadyText).toContain('ready:')
  })
})
