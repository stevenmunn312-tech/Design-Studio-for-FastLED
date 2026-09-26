import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../boardProfiles'
import { buildBomRows, buildConnectionRows } from '../buildExports'
import { ensureBuildProfile } from '../buildProfile'
import { calculateElectricalPlan } from '../electricalPlan'
import { buildHardwareManifest } from '../hardwareManifest'
import type { StudioNode } from '../../state/graphStore'
import { partById } from '../../state/partCatalogue'
import { ratedInputCurrentMa, sourceVoltageIssue } from '../../state/powerConverter'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'input', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const output = () => node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, chipset: 'WS2812B', dataPin: 14 })
const buck = (sourceVoltage = 12) => node('buck', 'PowerConverter', { partId: 'lm2596-buck-module', sourceVoltage })
const S3 = 'esp32:esp32:esp32s3'
const lm2596 = () => partById('lm2596-buck-module')!.powerConverter!

function planFor(nodes: StudioNode[], boardId = 'espressif-esp32-s3-devkitc-1') {
  const board = boardProfileById(boardId)
  const manifest = buildHardwareManifest(nodes, [], S3)
  return { board, manifest, plan: calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1 }), board) }
}

describe('controller supply from a buck converter', () => {
  it('reads the LM2596 ratings from the catalogue', () => {
    expect(lm2596()).toEqual(expect.objectContaining({ role: 'controller', outputSetV: 5, continuousCurrentMa: 2000, isolated: false }))
  })

  it('needs its input above the output by the dropout, and inside the rating', () => {
    expect(sourceVoltageIssue(lm2596(), 12)).toBeNull()
    expect(sourceVoltageIssue(lm2596(), 24)).toBeNull()
    expect(sourceVoltageIssue(lm2596(), 6)).toMatch(/at least 6.5 V/)
    expect(sourceVoltageIssue(lm2596(), 36)).toMatch(/rated to 35 V/)
  })

  it('sizes the input for full rated output, not an estimated load', () => {
    // 5 V x 2 A / 0.8 efficiency / 12 V
    expect(ratedInputCurrentMa(lm2596(), 12)).toBe(1042)
  })

  it('stays on USB power with no converter', () => {
    const { plan } = planFor([output()])
    expect(plan.controllerSupply).toBeUndefined()
    expect(plan.controllerPowerPath).toBe('USB-C power (controller only)')
  })

  it('lands the converter output on the board\'s own 5 V input pin', () => {
    const { board, plan } = planFor([output(), buck()])
    const powerIn = board!.pins!.find((pin) => pin.role === 'power-in')!

    expect(plan.blockers).toEqual([])
    expect(plan.controllerSupply).toEqual(expect.objectContaining({
      sourceVoltage: 12,
      outputVoltage: 5,
      powerInPinLabel: powerIn.label,
      powerInAnchorId: powerIn.anchorId,
      inputCurrentMa: 1042,
    }))
    expect(plan.controllerSupply?.inputFuse.ratingMa).toBe(1500)
    expect(plan.controllerPowerPath).toContain(`${powerIn.label} pin`)
    expect(plan.recommendations.join('\n')).toMatch(/Set the LM2596 .* to 5 V with a meter/)
    expect(plan.recommendations.join('\n')).toMatch(/diode-isolated from USB/)
  })

  it('blocks a source the converter cannot use', () => {
    const { plan } = planFor([output(), buck(5)])
    expect(plan.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'power-converter:buck:source-voltage', detail: expect.stringMatching(/too low/) }),
    ]))
  })

  it('blocks a board whose onboard power path is unverified', () => {
    const { plan } = planFor([output(), buck()], 'esp32-generic-devkit-38pin')
    expect(plan.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'power-converter:buck:board-power-path' }),
    ]))
  })

  it('blocks a second controller converter', () => {
    const second = buck()
    second.id = 'buck-2'
    const { plan } = planFor([output(), buck(), second])
    expect(plan.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'controller-converter-count' })]))
  })

  it('routes the export from the source through a fused input to the board pin', () => {
    const { board, manifest, plan } = planFor([output(), buck(24)])
    const powerIn = board!.pins!.find((pin) => pin.role === 'power-in')!
    const rows = buildConnectionRows(manifest.primaryItems, plan, board)
    const label = partById('lm2596-buck-module')!.label

    expect(rows.some((row) => row.fromTerminal === 'USB-C')).toBe(false)
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: '24 V DC source', fromTerminal: '+', to: expect.stringMatching(/input fuse$/) }),
      expect.objectContaining({ to: label, toTerminal: 'IN+' }),
      expect.objectContaining({ from: '24 V DC source', fromTerminal: '-', to: label, toTerminal: 'IN-' }),
      expect.objectContaining({ from: label, fromTerminal: 'OUT+', toTerminal: powerIn.label }),
      expect.objectContaining({ from: label, fromTerminal: 'OUT-', to: 'Common ground bus' }),
    ]))
    expect(buildBomRows(manifest, plan, ensureBuildProfile({ version: 1 }), board)).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: label, status: 'configured' }),
      expect.objectContaining({ item: `${label} input fuse and inline holder`, status: 'calculated' }),
      expect.objectContaining({ item: `${label} input conductors (+ and -)`, status: 'calculated' }),
    ]))
  })
})
