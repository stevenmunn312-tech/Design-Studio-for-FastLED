import { describe, expect, it } from 'vitest'
import { partById } from '../../../build/parts/partCatalogue'

describe('catalogued battery parts', () => {
  it('carries the Samsung 35E cell limits', () => {
    expect(partById('samsung-inr18650-35e')?.batteryCell).toEqual({
      chemistry: 'li-ion',
      formFactor: '18650',
      nominalV: 3.6,
      chargeV: 4.2,
      dischargeCutoffV: 2.65,
      capacityMah: 3350,
      maxContinuousDischargeMa: 8000,
      maxChargeMa: 2000,
      internalResistanceMohm: 35,
      internalResistanceBasis: 'ac-1khz',
      chargeTempC: [0, 45],
      dischargeTempC: [-20, 60],
    })
  })

  it('keeps combined functions on one physical board', () => {
    const module = partById('ip5305t-1s-power-module')?.batteryModule
    expect(module).toMatchObject({
      series: 1,
      chemistries: ['li-ion'],
      protection: { port: 'common', switchedLine: 'negative' },
      charger: { device: 'IP5305T', maxChargeMa: 1200 },
      output: { topology: 'boost', outputV: 5, continuousMa: 1000 },
    })
  })

  it('records both 4S protection choices and the standalone balancer', () => {
    expect(partById('hx-4s-f30a-bms-balance')?.batteryModule).toMatchObject({
      series: 4,
      protection: { continuousDischargeMa: 30000, overchargeV: 4.25 },
      balance: { type: 'passive', balanceMa: 60 },
    })
    expect(partById('bm3451-4s-60a-active-balance-bms')?.batteryModule).toMatchObject({
      series: 4,
      protection: { continuousDischargeMa: 60000, overDischargeV: 2.8 },
      balance: { type: 'active', balanceMa: 1000 },
    })
    expect(partById('4s-5a-active-balancer')?.batteryModule).toMatchObject({
      series: 4,
      balance: { type: 'active', balanceMa: 5000 },
    })
  })

  it('records charger configuration as part facts', () => {
    expect(partById('ip2368-100w-bidirectional-charger')?.batteryModule?.charger)
      .toMatchObject({ device: 'IP2368-COUT', chargeVPerCell: 4.2, inputMaxW: 100, bidirectional: true })
    expect(partById('16v8-2a-4s-liion-charger')?.batteryModule?.charger)
      .toMatchObject({ chargeVPerCell: 4.2, maxChargeMa: 2000, bidirectional: false })
  })

  it('records common-negative converter terminals and selected ratings', () => {
    expect(partById('generic-300w-9a-buck-module')?.powerConverter)
      .toMatchObject({ continuousCurrentMa: 9000, isolated: false, terminals: ['IN+', 'IN-', 'OUT+', 'OUT-'] })
    expect(partById('dgxby-20a-5v-buck-converter')?.powerConverter)
      .toMatchObject({ continuousCurrentMa: 20000, isolated: false })
    expect(partById('rcnun-60a-5v-buck-converter')?.powerConverter)
      .toMatchObject({ continuousCurrentMa: 60000, isolated: false })
  })
})
