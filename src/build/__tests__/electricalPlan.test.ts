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

    expect(plan.status).toBe('partial')
    expect(plan.requirementsCalculatedText).toBe('partial: conservative supply/current summary ready, conductor/fuse tables pending')
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
    expect(plan.unresolved).toHaveLength(3)
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

    expect(plan.status).toBe('partial')
    expect(plan.powerReadyText).toBe('pending owned LED supply declarations')
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

    expect(plan.powerReadyText).toBe('partial: assigned LED supplies satisfy conservative current/voltage budget; controller branch, wire, fuse, and connector validation still pending')
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

    expect(plan.powerReadyText).toBe('needs review: 3 owned supply validation issues')
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
})
