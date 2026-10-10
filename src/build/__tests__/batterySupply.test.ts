import { describe, expect, it } from 'vitest'
import type { StudioNode } from '../../state/graphStore'
import { boardProfileById } from '../boards/boardProfiles'
import { buildBomRows, buildConnectionRows } from '../buildExports'
import { ensureBuildProfile } from '../buildProfile'
import { buildHardwareManifest } from '../hardwareManifest'
import { PART_CATALOGUE } from '../parts/partCatalogue'
import { calculateElectricalPlan } from '../power/electricalPlan'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'input', properties, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

const board = boardProfileById('espressif-esp32-s3-devkitc-1')
const pack = (series: number, parallel: number) => node('pack', 'BatteryPack', {
  partId: 'samsung-inr18650-35e', series, parallel,
})
const module = (id: string, partId: string) => node(id, 'BatteryModule', { partId })
const output = (width: number, height: number) => node('out', 'MatrixOutput', {
  form: 'matrix', width, height, chipset: 'WS2812B', dataPin: 14,
})
const converter = (partId: string) => node('rail', 'PowerConverter', { partId, sourceVoltage: 12 })

function planFor(nodes: StudioNode[]) {
  const manifest = buildHardwareManifest(nodes, [], 'esp32:esp32:esp32s3')
  const plan = calculateElectricalPlan(manifest, ensureBuildProfile({ version: 1 }), board)
  return { manifest, plan }
}

function issueIds(nodes: StudioNode[]) {
  const plan = planFor(nodes).plan
  return [...plan.blockers, ...plan.warnings].map((entry) => entry.id)
}

describe('battery power planning', () => {
  it('uses a 1S combined module as one 5 V boost zone', () => {
    const { plan } = planFor([
      pack(1, 1),
      module('power-bank', 'ip5305t-1s-power-module'),
      output(10, 1),
    ])

    expect(plan.battery?.window).toEqual({ minV: 2.4, fullV: 4.2, ceilingV: 4.3 })
    expect(plan.totals?.source).toBeUndefined()
    expect(plan.totals?.supplies).toHaveLength(1)
    expect(plan.totals?.supplies[0].converter).toEqual(expect.objectContaining({
      partId: 'ip5305t-1s-power-module',
      sourceVoltage: 2.4,
      integrated: true,
    }))
    expect(plan.controllerPowerPath).toMatch(/5 V output from the battery pack/)
  })

  it('plans one 20 A buck for a 16x16 full-white load at pack minimum voltage', () => {
    const { plan } = planFor([
      pack(4, 5),
      module('bms', 'hx-4s-f30a-bms-balance'),
      module('charger', 'ip2368-100w-bidirectional-charger'),
      converter('dgxby-20a-5v-buck-converter'),
      output(16, 16),
    ])

    expect(plan.battery?.window).toEqual({ minV: 10.2, fullV: 16.8, ceilingV: 17 })
    expect(plan.totals?.source).toBeUndefined()
    expect(plan.totals?.supplies).toHaveLength(1)
    expect(plan.totals?.supplies[0].converter?.sourceVoltage).toBe(10.2)
    expect(plan.blockers.map((entry) => entry.id)).not.toContain('battery-led-without-rail')
  })

  it('plans two 60 A bucks for 32x32 and keeps the 30 A limit runtime-only', () => {
    const { plan } = planFor([
      node('board', 'Board', { powerLimit: true, volts: 5, milliamps: 30000 }),
      pack(4, 10),
      module('bms', 'bm3451-4s-60a-active-balance-bms'),
      module('charger', 'ip2368-100w-bidirectional-charger'),
      converter('rcnun-60a-5v-buck-converter'),
      output(32, 32),
    ])

    expect(plan.totals?.designCurrentMa).toBe(61440)
    expect(plan.totals?.operatingCurrentCapMa).toBe(30000)
    expect(plan.totals?.supplies).toHaveLength(2)
    expect(plan.totals?.supplies.every((supply) => supply.converter?.partId === 'rcnun-60a-5v-buck-converter')).toBe(true)
    expect(plan.battery?.dischargeDesignCurrentMa).toBeGreaterThan(30000)
    expect(plan.battery?.mainFuse.ratingMa).toBe(50000)
    expect(plan.battery?.limitedRuntimeHours).toBeGreaterThan(plan.battery?.runtimeHours ?? 0)
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'battery-discharge-rate' })]))
    expect(plan.recommendations.some((entry) => entry.includes('professional with high-power, low-voltage experience'))).toBe(true)
  })

  it('enforces protection, balance, module matching and converter window rules', () => {
    const missing = planFor([pack(4, 1), converter('dgxby-20a-5v-buck-converter'), output(8, 8)]).plan
    expect(missing.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'battery-no-protection' })]))
    expect(missing.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'battery-no-balance' })]))

    const mismatch = planFor([pack(1, 1), module('bms', 'hx-4s-f30a-bms-balance')]).plan
    expect(mismatch.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'battery-hx-4s-f30a-bms-balance-series' })]))

    const high = planFor([
      pack(4, 2),
      module('bms', 'hx-4s-f30a-bms-balance'),
      converter('tps61023-1s-5v-boost-module'),
      output(8, 8),
    ]).plan
    expect(high.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'power-converter:rail:source-window-high' })]))
  })

  it('reports pack, provider, orphan, voltage and load rules', () => {
    expect(issueIds([pack(4, 1), node('pack-2', 'BatteryPack', {
      partId: 'not-a-cell', series: 4, parallel: 1,
    })])).toContain('battery-pack-count')
    expect(issueIds([
      pack(4, 1),
      module('bms-1', 'hx-4s-f30a-bms-balance'),
      module('bms-2', 'bm3451-4s-60a-active-balance-bms'),
    ])).toContain('battery-function-count')
    expect(issueIds([module('bms', 'hx-4s-f30a-bms-balance')])).toContain('battery-module-orphan')
    expect(issueIds([pack(8, 1), module('bms', 'hx-4s-f30a-bms-balance')])).toContain('battery-pack-voltage')

    const noLoad = issueIds([pack(1, 1), module('power-bank', 'ip5305t-1s-power-module')])
    expect(noLoad).toContain('battery-no-load')
    expect(noLoad).toContain('battery-charge-temperature')
    expect(noLoad).toContain('battery-cutoff-below-cell')

    expect(issueIds([pack(4, 2), module('bms', 'hx-4s-f30a-bms-balance'), output(8, 8)]))
      .toContain('battery-led-without-rail')
    expect(issueIds([pack(4, 2), module('bms', 'hx-4s-f30a-bms-balance')]))
      .toContain('battery-controller-usb')
    expect(issueIds([
      pack(4, 2), module('bms', 'hx-4s-f30a-bms-balance'),
      node('pd', 'PdTriggerSource', { requestedVoltage: 12 }),
    ])).toContain('pd-trigger-battery')
  })

  it('reports low, impossible and overcurrent source paths', () => {
    expect(issueIds([
      pack(1, 1), module('bms', 'hx-4s-f30a-bms-balance'),
      converter('dgxby-20a-5v-buck-converter'), output(8, 8),
    ])).toContain('power-converter:rail:source-window-never')
    expect(issueIds([
      pack(2, 2), module('bms', 'hx-4s-f30a-bms-balance'),
      converter('generic-300w-9a-buck-module'), output(8, 8),
    ])).toContain('power-converter:rail:source-window-low')
    expect(issueIds([
      pack(1, 1), module('power-bank', 'ip5305t-1s-power-module'), output(10, 1),
    ])).toContain('battery-main-fuse')
    expect(issueIds([
      pack(4, 1), module('bms', 'hx-4s-f30a-bms-balance'),
      module('charger', 'ip2368-100w-bidirectional-charger'),
    ])).toContain('battery-charge-current')
  })

  it('enforces protection topology, chemistry and charger voltage catalogue facts', () => {
    const entry = PART_CATALOGUE['hx-4s-f30a-bms-balance']
    const original = entry.batteryModule
    entry.batteryModule = {
      ...original!,
      chemistries: ['lifepo4'],
      protection: { ...original!.protection!, port: 'separate' },
      charger: {
        device: 'test charger', chargeVPerCell: 4.3, maxChargeMa: 1000,
        inputMaxW: 20, inputProtocols: 'DC', bidirectional: false,
        batteryTerminals: ['BAT+', 'BAT-'],
      },
    }
    try {
      const ids = issueIds([pack(4, 1), module('bms', 'hx-4s-f30a-bms-balance')])
      expect(ids).toContain('battery-protection-unsupported')
      expect(ids).toContain('battery-hx-4s-f30a-bms-balance-chemistry')
      expect(ids).toContain('battery-charger-voltage')
    } finally {
      entry.batteryModule = original
    }
  })

  it('exports B+, B-, P- and battery parts without a recommended DC source', () => {
    const { manifest, plan } = planFor([
      pack(4, 5),
      module('bms', 'hx-4s-f30a-bms-balance'),
      module('charger', 'ip2368-100w-bidirectional-charger'),
      converter('dgxby-20a-5v-buck-converter'),
      output(16, 16),
    ])
    const connections = buildConnectionRows(manifest.primaryItems, plan, board)
    const bom = buildBomRows(manifest, plan, ensureBuildProfile({ version: 1 }), board)

    expect(connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromTerminal: 'B+', to: expect.stringContaining('main fuse') }),
      expect.objectContaining({ fromTerminal: 'B-', toTerminal: 'B-' }),
      expect.objectContaining({ fromTerminal: 'P-', to: 'Common ground bus' }),
      expect.objectContaining({ from: 'battery pack', fromTerminal: '+BATT', to: expect.stringContaining('input fuse') }),
      expect.objectContaining({ from: '+BATT bus', to: expect.stringContaining('charger branch fuse') }),
      expect.objectContaining({ from: expect.stringContaining('charger branch fuse'), toTerminal: 'BAT+' }),
    ]))
    expect(connections.some((row) => row.from === board?.label && row.to.includes('BMS'))).toBe(false)
    expect(bom).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: '20', item: 'Samsung INR18650-35E Li-ion cell' }),
      expect.objectContaining({ item: 'Battery main fuse and insulated holder' }),
    ]))
    expect(bom.some((row) => row.item.startsWith('Recommended ') && row.item.endsWith(' DC source'))).toBe(false)
  })
})
