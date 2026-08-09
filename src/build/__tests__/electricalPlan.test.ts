import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../boardProfiles'
import { ensureBuildProfile } from '../buildProfile'
import { calculateElectricalPlan } from '../electricalPlan'
import { buildHardwareManifest } from '../hardwareManifest'
import type { StudioNode } from '../../state/graphStore'

function outputNode(width = 16, height = 16, extra: Record<string, unknown> = {}): StudioNode {
  return {
    id: 'out',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: 'Matrix Output',
      nodeType: 'MatrixOutput',
      category: 'output',
      properties: { width, height, chipset: 'WS2812B', dataPin: 14, ...extra },
      inputs: [],
      outputs: [],
    },
  } as unknown as StudioNode
}

describe('electricalPlan', () => {
  it('generates the complete recommendation from graph hardware before board confirmation', () => {
    const manifest = buildHardwareManifest([outputNode()], [], 'esp32:esp32:esp32s3')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile(undefined), undefined)

    expect(plan.status).toBe('blocked')
    expect(plan.blockers.map((entry) => entry.id)).toEqual(['exact-board'])
    expect(plan.requirementsCalculatedText).toBe('waiting for exact-board confirmation')
    expect(plan.outputs).toEqual([
      expect.objectContaining({
        pixelCount: 256,
        designCurrentMa: 15360,
        recommendedFeedCount: 4,
        pixelsPerFeed: 64,
        branchDesignCurrentMa: 3840,
        recommendedSupplyCurrentMa: 19200,
        conductor: expect.objectContaining({ awg: 20, crossSectionMm2: 0.5 }),
        connectorMinimumMa: 7500,
        fuse: expect.objectContaining({ ratingMa: 7500 }),
      }),
    ])
    expect(plan.unresolved).toEqual([])
  })

  it('becomes ready immediately after exact-board confirmation', () => {
    const manifest = buildHardwareManifest([outputNode()], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const profile = ensureBuildProfile({ version: 1, physicalBoardProfileId: board?.id })
    const plan = calculateElectricalPlan(manifest, profile, board)

    expect(plan.status).toBe('calculated')
    expect(plan.requirementsCalculatedText).toContain('generated from graph with build-rules-')
    expect(plan.controllerPowerPath).toBe('USB-C power (controller only)')
    expect(plan.powerReadyPasses).toBe(true)
    expect(plan.powerReadyText).toContain('recommended supply')
    expect(plan.supplyChecks).toEqual([])
    expect(plan.branchChecks).toEqual([])
  })

  it('splits large matrices into practical feeds and multiple supplies automatically', () => {
    const manifest = buildHardwareManifest([outputNode(64, 64)], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1, physicalBoardProfileId: board?.id }), board)

    expect(plan.outputs[0]).toEqual(expect.objectContaining({
      pixelCount: 4096,
      designCurrentMa: 245760,
      recommendedFeedCount: 62,
      pixelsPerFeed: 67,
    }))
    expect(plan.totals).toEqual(expect.objectContaining({
      recommendedSupplyCurrentMa: 307200,
      recommendedSupplyWattage: 1536,
      recommendedSupplyCount: 6,
      perSupplyCurrentMa: 52000,
    }))
  })

  it('shows a firmware cap separately without weakening physical recommendations', () => {
    const manifest = buildHardwareManifest([outputNode(16, 16, { powerLimit: true, milliamps: 9000 })], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1, physicalBoardProfileId: board?.id }), board)

    expect(plan.outputs[0]?.operatingCurrentCapMa).toBe(9000)
    expect(plan.outputs[0]?.designCurrentMa).toBe(15360)
    expect(plan.totals?.recommendedSupplyCurrentMa).toBe(19200)
  })

  it('ignores obsolete planner answers and always regenerates from graph hardware', () => {
    const manifest = buildHardwareManifest([outputNode()], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({
      version: 1,
      physicalBoardProfileId: board?.id,
      outputs: {
        'output:out': {
          physicalLengthMm: 99_000,
          ledDensityPerMeter: 1,
          feedCableLengthMm: 25_000,
          desiredCurrentCapMa: 100,
        },
      },
      assumptions: {
        supplyHeadroomPercent: 1,
        allowedVoltageDropPercent: 99,
      },
    }), board)

    expect(plan.outputs[0]).toEqual(expect.objectContaining({
      physicalLengthMm: 4267,
      estimatedDensityPerMeter: 60,
      operatingCurrentCapMa: undefined,
      recommendedSupplyCurrentMa: 19200,
      recommendedFeedCount: 4,
    }))
    expect(plan.totals?.headroomPercent).toBe(25)
  })

  it('keeps reduced-confidence boards usable while warning against board-powered LED loads', () => {
    const manifest = buildHardwareManifest([outputNode()], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('generic-esp32-s3-n16r8-44pin-dual-usbc')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1, physicalBoardProfileId: board?.id }), board)

    expect(plan.powerReadyPasses).toBe(true)
    expect(plan.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'board-power-confidence' }),
    ]))
  })
})
