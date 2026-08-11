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
        recommendedFeedCount: 3,
        pixelsPerFeed: 128,
        branchDesignCurrentMa: 7680,
        recommendedSupplyCurrentMa: 20000,
        conductor: expect.objectContaining({ awg: 20, crossSectionMm2: 0.5 }),
        connectorMinimumMa: 15000,
        fuse: expect.objectContaining({ ratingMa: 15000 }),
        injections: [
          expect.objectContaining({ role: 'start', designCurrentMa: 3840, maximumCurrentMa: 5000, positionMm: 0, fuse: expect.objectContaining({ ratingMa: 7500 }) }),
          expect.objectContaining({ role: 'center', designCurrentMa: 7680, maximumCurrentMa: 10000, positionMm: 2134, fuse: expect.objectContaining({ ratingMa: 15000 }) }),
          expect.objectContaining({ role: 'end', designCurrentMa: 3840, maximumCurrentMa: 5000, positionMm: 4267, fuse: expect.objectContaining({ ratingMa: 7500 }) }),
        ],
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
      recommendedFeedCount: 26,
      pixelsPerFeed: 166,
    }))
    expect(plan.totals).toEqual(expect.objectContaining({
      recommendedSupplyCurrentMa: 300000,
      recommendedSupplyWattage: 1500,
      recommendedSupplyCount: 5,
      headroomPercent: 20,
    }))
    expect(plan.outputs[0].injections[0]).toEqual(expect.objectContaining({ role: 'start', designCurrentMa: 4980, conductor: expect.objectContaining({ awg: 20 }) }))
    expect(plan.outputs[0].injections[1]).toEqual(expect.objectContaining({ role: 'center', designCurrentMa: 9960, conductor: expect.objectContaining({ awg: 18 }) }))
    expect(plan.outputs[0].injections.every((injection) => injection.designCurrentMa <= injection.maximumCurrentMa)).toBe(true)
    expect(plan.outputs[0].injections.every((injection) => (injection.conductor?.voltageDrop ?? Infinity) <= 0.4)).toBe(true)
    expect(plan.totals?.supplies.every((supply) => supply.recommendedCurrentMa <= 60000)).toBe(true)
  })

  it('shows a firmware cap separately without weakening physical recommendations', () => {
    const manifest = buildHardwareManifest([outputNode(16, 16, { powerLimit: true, milliamps: 9000 })], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1, physicalBoardProfileId: board?.id }), board)

    expect(plan.outputs[0]?.operatingCurrentCapMa).toBe(9000)
    expect(plan.outputs[0]?.designCurrentMa).toBe(15360)
    expect(plan.totals?.recommendedSupplyCurrentMa).toBe(20000)
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
      recommendedSupplyCurrentMa: 20000,
      recommendedFeedCount: 3,
    }))
    expect(plan.totals?.headroomPercent).toBe(20)
  })

  it('lets multiple modest data routes share one adequately sized PSU', () => {
    const second = outputNode(8, 8)
    second.id = 'out-2'
    const manifest = buildHardwareManifest([outputNode(), second], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1, physicalBoardProfileId: board?.id }), board)

    expect(plan.outputs).toHaveLength(2)
    expect(plan.totals?.supplies).toHaveLength(1)
    expect(plan.totals?.supplies[0].outputIds).toEqual(['output:out', 'output:out-2'])
  })

  it('rounds a headroom target down when it is less than 2 A above a 10 A boundary', () => {
    const manifest = buildHardwareManifest([outputNode(19, 23)], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1, physicalBoardProfileId: board?.id }), board)

    expect(plan.totals?.designCurrentMa).toBe(26220)
    expect(plan.totals?.recommendedSupplyCurrentMa).toBe(30000)
    expect(plan.totals?.recommendedSupplyWattage).toBe(150)
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

  it('blocks readiness rather than drawing unsupported output wiring', () => {
    const manifest = buildHardwareManifest([outputNode(8, 8, { chipset: 'APA102', clockPin: 13 })], [], 'esp32:esp32:esp32s3')
    const board = boardProfileById('espressif-esp32-s3-devkitc-1')
    const plan = calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1, physicalBoardProfileId: board?.id }), board)

    expect(plan.outputs).toEqual([])
    expect(plan.powerReadyPasses).toBe(false)
    expect(plan.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'unsupported:output:out' })]))
  })
})
