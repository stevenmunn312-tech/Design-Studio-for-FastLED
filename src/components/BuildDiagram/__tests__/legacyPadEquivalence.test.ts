import { describe, expect, it } from 'vitest'
import legacy from './fixtures/legacyPadFacts.json'
import { PART_CATALOGUE } from '../../../build/parts/partCatalogue'
import type { HardwareManifestItem } from '../../../build/hardwareManifest'
import { distanceSensorTransport } from '../../../state/peripherals/distanceSensor'
import { lightSensorTransport } from '../../../state/peripherals/lightSensor'
import {
  modulePadGeometry, peripheralGroundPadIndex, peripheralPadCount, peripheralPadPoint, peripheralPadRadius,
  peripheralPowerNet, peripheralPowerPadIndex,
} from '../physicalDiagramLayout'

/*
 * `fixtures/legacyPadFacts.json` was captured from the Build Diagram before its
 * per-part tables moved into the manifests: for every bundled part, under every
 * kind it is drawn as, each pad's point, the pad count, the hole radius, the
 * supply pad and rail, and the ground pad, all computed by the old
 * `MODULE_PAD_GEOMETRY`, `MODULE_PAD_HOLE_RADIUS`, `peripheralPowerNet` and
 * `peripheralPowerPadIndex`. This holds the manifest-driven code to exactly
 * those numbers. Do not regenerate it from current code: that would make the
 * comparison say nothing.
 */
/*
 * Deliberate corrections to the frozen record. The retired table put the
 * HC-SR501 PIR on the 3.3 V rail, but the module's own regulator wants 4.5 to
 * 20 V (its datasheets, cited in the part's `sources`) and its wiring note and
 * `motionSensor.supplyVolts` already said 5 V. Only OUT is 3.3 V logic. The
 * diagram now wires VCC to 5 V; the pad positions are unchanged.
 */
const CORRECTED_NET: Record<string, 'v5'> = { 'hc-sr501-pir-sensor': 'v5' }

interface LegacyRecord {
  partId: string
  kind: HardwareManifestItem['kind']
  nodeType: string
  count: number
  points: Array<{ x: number; y: number }>
  radius: number
  net: 'v3v3' | 'v5' | 'v12' | null
  index: number | null
  ground: number
}

function itemFor({ kind, partId, nodeType }: LegacyRecord): HardwareManifestItem {
  const entry = PART_CATALOGUE[partId]
  const facts: Record<string, unknown> = { partId }
  if (nodeType === 'PowerAmplifier') facts.stage = 'power'
  if (nodeType === 'DFPlayerOutput') facts.stage = 'player'
  if (kind === 'distance-input') facts.transport = distanceSensorTransport(partId)
  if (kind === 'light-input') facts.transport = lightSensorTransport(partId)
  if (kind === 'digital-sensor-input' && entry?.digitalSensor?.supplyVolts !== undefined) {
    facts.supplyVoltage = entry.digitalSensor.supplyVolts
  }
  if (kind === 'analog-sensor-input' && entry?.analogSensor) facts.supplyVoltage = entry.analogSensor.supplyVolts
  return { kind, facts, pins: [], title: partId } as unknown as HardwareManifestItem
}

describe('manifest-driven Build Diagram facts match the retired per-part tables', () => {
  const records = legacy as LegacyRecord[]

  it('covers every bundled part that was measured', () => {
    const covered = new Set(records.map((record) => record.partId))
    const measured = Object.keys(PART_CATALOGUE).filter((partId) => modulePadGeometry(partId))
    expect(measured.filter((partId) => !covered.has(partId))).toEqual([])
  })

  it.each(records.map((record) => [`${record.partId || '(uncatalogued)'} as ${record.kind}`, record] as const))(
    '%s',
    (_name, record) => {
      const item = itemFor(record)
      const layout = { item, x: 0, y: 0, width: 100, height: 100 }
      expect(peripheralPadCount(item)).toBe(record.count)
      expect(Array.from({ length: record.count }, (_, index) => peripheralPadPoint(layout, index))).toEqual(record.points)
      expect(peripheralPadRadius(item)).toBe(record.radius)
      expect(peripheralPowerNet(item)).toBe(CORRECTED_NET[record.partId] ?? record.net)
      expect(peripheralPowerPadIndex(item)).toBe(record.index)
      expect(peripheralGroundPadIndex(item)).toBe(record.ground)
    },
  )
})
