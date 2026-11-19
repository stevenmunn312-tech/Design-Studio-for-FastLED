import { afterEach, describe, expect, it } from 'vitest'
import { PART_CATALOGUE_DATA } from '../../build/generated/partCatalogueData'
import { effectiveDataRateMhz, clockedRateFix } from '../../build/ledDrivers'
import { ledPitchMm } from '../../build/hardware'
import { ledSupplyVolts, controllerSettings } from '../../build/controllerSettings'
import { ledFullWhiteDraw } from '../../build/power/ledDraw'
import { ledLoads } from '../../build/power/powerCap'
import { buildHardwareManifest } from '../../build/hardwareManifest'
import { generateCpp } from '../../codegen/cppGenerator'
import { PART_CATALOGUE, registerParts, resetRegisteredPartsForTests, ringDiameterMm } from '../../build/parts/partCatalogue'
import type { PartManifest } from '../../build/parts/manifest/partManifest'
import { unresolvedPartSummaries } from '../../build/parts/partResolution'
import type { StudioNode } from '../../state/graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../state/nodeLibrary'
import { ledDataRateCeilingMhz, stampLedProduct } from '../../state/output/ledProduct'
import { buildGraphDiagnostics, findDeployBlockingErrors } from '../validateGraph'
import { wireOutputs } from '../wireTime'
import { uploadBlockReason } from '../uploadBlockReason'

const S3 = 'esp32:esp32:esp32s3'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as unknown as StudioNode
}

function customCopy(partId: string, fresh: string, change: (ledOutput: Record<string, unknown>) => void): PartManifest {
  const copy = JSON.parse(JSON.stringify(PART_CATALOGUE_DATA[partId])) as PartManifest & { ledOutput: Record<string, unknown> }
  copy.partId = fresh
  change(copy.ledOutput)
  return copy
}

const LED_PARTS = Object.values(PART_CATALOGUE).filter((entry) => entry.ledOutput)

afterEach(() => resetRegisteredPartsForTests())

describe('LED product facts in the readers', () => {
  it('give a named bundled part the same draw as the Custom node with its properties, except HUB75', () => {
    for (const entry of LED_PARTS) {
      const spec = entry.ledOutput!
      const stamped = stampLedProduct({ form: 'strip', ledCount: 10 }, entry.partId)!
      const named = ledFullWhiteDraw(stamped.chipset, stamped.form, entry.partId)
      const custom = ledFullWhiteDraw(stamped.chipset, stamped.form)
      if (spec.form === 'hub75') {
        // The datasheet figure replaces the 1 mA a pixel the app assumed.
        expect(custom.maPerLed).toBe(1)
        expect(named).toEqual({ volts: 5, maPerLed: 1.62 })
      } else {
        expect(named, entry.partId).toEqual(custom)
      }
      expect(ledSupplyVolts(stamped.chipset, entry.partId)).toBe(ledSupplyVolts(stamped.chipset))
    }
  })

  it('leave Custom, an empty id and a part this version lacks on the chipset figures', () => {
    expect(ledFullWhiteDraw('WS2815', 'strip')).toEqual({ volts: 12, maPerLed: 25 })
    expect(ledFullWhiteDraw('WS2815', 'strip', '')).toEqual({ volts: 12, maPerLed: 25 })
    expect(ledFullWhiteDraw('WS2815', 'strip', 'acme-unknown')).toEqual({ volts: 12, maPerLed: 25 })
    expect(ledPitchMm('strip')).toBe(10)
    expect(ledPitchMm('strip', 'acme-unknown')).toBe(10)
    expect(ledPitchMm('hub75')).toBe(4)
  })

  it('size a named part on the bench from its own pitch and diameter', () => {
    expect(ledPitchMm('strip', 'ws2812b-strip')).toBe(16.7)
    expect(ledPitchMm('matrix', 'ws2812b-matrix-16x16')).toBe(10)
    expect(ledPitchMm('hub75', 'hub75-panel-64x64-p4')).toBe(4)
    expect(ringDiameterMm(24, 'ws2812b-ring-24')).toBe(65.5)
    expect(ringDiameterMm(24)).toBe(65.5)
    expect(ringDiameterMm(20, 'ws2812b-ring-24')).toBe(ringDiameterMm(20))
  })

  it('feed the Board, the power loads and the player sketch from a product at another voltage', () => {
    registerParts([customCopy('ws2812b-strip', 'acme-12v-strip', (spec) => {
      spec.supplyVolts = 12
      spec.fullWhiteMa = 25
    })], 'bundled')
    const named = node('out', 'MatrixOutput', { ...stampLedProduct({ form: 'strip', ledCount: 30 }, 'acme-12v-strip')! })
    const custom = node('out', 'MatrixOutput', { form: 'strip', ledCount: 30, chipset: 'WS2812B' })
    expect(controllerSettings([node('b', 'Board'), named]).volts).toBe(12)
    expect(controllerSettings([node('b', 'Board'), custom]).volts).toBe(5)
    expect(ledLoads([named])[0].fullWhiteMw).toBe(30 * 25 * 12)
    expect(ledLoads([custom])[0].fullWhiteMw).toBe(30 * 60 * 5)
    const item = buildHardwareManifest([node('b', 'Board'), named], [], S3).items.find((entry) => entry.kind === 'matrix-output')!
    expect(item.facts.ledPartId).toBe('acme-12v-strip')
    const customItem = buildHardwareManifest([node('b', 'Board'), custom], [], S3).items.find((entry) => entry.kind === 'matrix-output')!
    expect(customItem.facts).not.toHaveProperty('ledPartId')
  })
})

describe('the clock ceiling', () => {
  const clocked = () => registerParts([customCopy('ws2812b-strip', 'acme-apa-strip', (spec) => {
    spec.chipset = 'APA102'
    spec.maxDataRateMhz = 12
  })], 'bundled')

  it('caps the rate to the fastest offered rate within it, and never touches Custom', () => {
    expect(effectiveDataRateMhz('APA102', 24)).toBe(24)
    expect(effectiveDataRateMhz('APA102', 24, 12)).toBe(12)
    expect(effectiveDataRateMhz('APA102', 20, 11)).toBe(10)
    expect(effectiveDataRateMhz('APA102', 0, 12)).toBe(6)
    expect(effectiveDataRateMhz('APA102', 8, 12)).toBe(8)
    expect(effectiveDataRateMhz('WS2812B', 24, 12)).toBeNull()
    expect(clockedRateFix('APA102', 8, 12)).toEqual({ fromMhz: 8, toMhz: 10 })
    expect(clockedRateFix('APA102', 12, 12)).toBeNull()
  })

  it('reaches the firmware and the wire-time estimate through the node', () => {
    clocked()
    const props = { ...stampLedProduct({ form: 'strip', ledCount: 30 }, 'acme-apa-strip')!, dataRateMhz: 24 }
    expect(ledDataRateCeilingMhz(props)).toBe(12)
    expect(ledDataRateCeilingMhz({ ...props, partId: '' })).toBeNull()
    const nodes = [node('b', 'Board'), node('out', 'MatrixOutput', props)]
    expect(generateCpp(nodes, [])).toContain('DATA_RATE_MHZ(12)')
    const custom = [node('b', 'Board'), node('out', 'MatrixOutput', { ...props, partId: '' })]
    expect(generateCpp(custom, [])).toContain('DATA_RATE_MHZ(24)')
    expect(wireOutputs(nodes, [])).toBeDefined()
  })
})

describe('validation of a named LED output', () => {
  const diag = (nodes: StudioNode[], id: string) => buildGraphDiagnostics(nodes, []).find((entry) => entry.id === id)

  it('is silent for Custom and for a well-formed named output', () => {
    const custom = node('out', 'MatrixOutput', { form: 'strip', ledCount: 9000 % 4096 })
    expect(buildGraphDiagnostics([node('b', 'Board'), custom], []).filter((entry) => entry.id.includes('led-product'))).toEqual([])
    const fine = node('out', 'MatrixOutput', stampLedProduct({ form: 'strip', ledCount: 60 }, 'ws2812b-strip')!)
    expect(buildGraphDiagnostics([node('b', 'Board'), fine], []).filter((entry) => entry.id.includes('led-product'))).toEqual([])
  })

  it('warns, with the fix, for a count the reel does not come in', () => {
    const output = node('out', 'MatrixOutput', { ...stampLedProduct({ form: 'strip', ledCount: 60 }, 'ws2812b-strip')!, ledCount: 400 })
    const card = diag([node('b', 'Board'), output], 'out-led-product-count')
    expect(card).toMatchObject({ severity: 'warning', propertyKey: 'ledCount' })
    expect(card?.message).toContain('at most 240')
    expect(card?.fix).toContain('240')
    const ring = node('out', 'MatrixOutput', { ...stampLedProduct({ form: 'strip', ledCount: 60 }, 'ws2812b-ring-24')!, ledCount: 10 })
    expect(diag([node('b', 'Board'), ring], 'out-led-product-count')?.message).toContain('has 24 LEDs')
  })

  it('warns for a form the part does not fit, and for locked facts that drifted', () => {
    const wrongForm = node('out', 'MatrixOutput', { ...stampLedProduct({ form: 'strip', ledCount: 60 }, 'ws2812b-ring-24')!, form: 'matrix' })
    expect(diag([node('b', 'Board'), wrongForm], 'out-led-product-form')).toMatchObject({ severity: 'warning', propertyKey: 'partId' })
    const drifted = node('out', 'MatrixOutput', { ...stampLedProduct({ form: 'strip', ledCount: 60 }, 'ws2812b-matrix-16x16')!, width: 8 })
    expect(diag([node('b', 'Board'), drifted], 'out-led-product-facts')).toMatchObject({ severity: 'warning', propertyKey: 'width' })
  })

  it('warns for a clock above the product ceiling and offers the repair', () => {
    registerParts([customCopy('ws2812b-strip', 'acme-apa-strip', (spec) => {
      spec.chipset = 'APA102'
      spec.maxDataRateMhz = 12
    })], 'bundled')
    const output = node('out', 'MatrixOutput', { ...stampLedProduct({ form: 'strip', ledCount: 30 }, 'acme-apa-strip')!, dataRateMhz: 24 })
    const card = diag([node('b', 'Board'), output], 'out-led-product-data-rate')
    expect(card).toMatchObject({ severity: 'warning', repair: { kind: 'set-data-rate', nodeId: 'out', dataRateMhz: 12 } })
    const fine = node('out', 'MatrixOutput', { ...stampLedProduct({ form: 'strip', ledCount: 30 }, 'acme-apa-strip')!, dataRateMhz: 8 })
    expect(diag([node('b', 'Board'), fine], 'out-led-product-data-rate')).toBeUndefined()
  })

  it('blocks a 12 V product on a 5 V supply, and a 5 V product on 12 V, but not on a matching supply', () => {
    registerParts([customCopy('ws2812b-strip', 'acme-12v-strip', (spec) => {
      spec.supplyVolts = 12
      spec.fullWhiteMa = 25
    })], 'bundled')
    const twelve = node('out', 'MatrixOutput', stampLedProduct({ form: 'strip', ledCount: 30 }, 'acme-12v-strip')!)
    const supply = (voltage: number) => node('psu', 'PowerSupply', { voltage, ratedCurrentA: 10 })
    const onFive = diag([node('b', 'Board'), twelve, supply(5)], 'out-led-product-supply')
    expect(onFive).toMatchObject({ severity: 'error', category: 'power' })
    expect(onFive?.message).toContain('will not light')
    expect(onFive?.fix).toContain('12 V')
    expect(diag([node('b', 'Board'), twelve, supply(12)], 'out-led-product-supply')).toBeUndefined()
    const five = node('out', 'MatrixOutput', stampLedProduct({ form: 'strip', ledCount: 30 }, 'ws2812b-strip')!)
    expect(diag([node('b', 'Board'), five, supply(12)], 'out-led-product-supply')?.message).toContain('damage')
    // No supply entered: nothing to compare against.
    expect(diag([node('b', 'Board'), twelve], 'out-led-product-supply')).toBeUndefined()
    // A Custom output is not judged here.
    const custom = node('out', 'MatrixOutput', { form: 'strip', ledCount: 30, chipset: 'WS2815' })
    expect(diag([node('b', 'Board'), custom, supply(5)], 'out-led-product-supply')).toBeUndefined()
  })
})

describe('a data link or level shifter this version does not hold', () => {
  const output = (props: Record<string, unknown> = {}) => node('out', 'MatrixOutput', { form: 'strip', ledCount: 30, dataPin: 5, ...props })
  const UNKNOWN = 'acme-future-extender'

  it('reports the data link in Graph Health, blocks Upload with a plain reason, and drops the output from code', () => {
    const nodes = [node('b', 'Board'), output({ dataLinkPartId: UNKNOWN })]
    const card = buildGraphDiagnostics(nodes, []).find((entry) => entry.id === 'out-unknown-part-dataLinkPartId')
    expect(card).toMatchObject({ severity: 'error', propertyKey: 'dataLinkPartId' })
    expect(card?.message).toContain(UNKNOWN)
    expect(findDeployBlockingErrors(nodes, []).some((message) => message.includes(UNKNOWN))).toBe(true)
    const summaries = unresolvedPartSummaries(nodes)
    expect(summaries).toHaveLength(1)
    expect(uploadBlockReason({
      busy: false, hasBuildOutput: true, isShowUpload: false, showHasContent: false, waitingForTrust: false,
      unresolvedParts: summaries, graphBlockerCount: 1, preparing: false, otherBlockers: [], tools: [],
    })?.text).toContain(UNKNOWN)
    const code = generateCpp(nodes, [])
    expect(code).toContain('Not generated:')
    expect(code).not.toContain('FastLED.addLeds')
  })

  it('reports an unknown shifter on the Board and holds every output on it', () => {
    const nodes = [node('b', 'Board', { levelShifterPartId: 'acme-future-shifter' }), output()]
    const card = buildGraphDiagnostics(nodes, []).find((entry) => entry.id === 'b-unknown-part-levelShifterPartId')
    expect(card).toMatchObject({ severity: 'error', propertyKey: 'levelShifterPartId' })
    expect(unresolvedPartSummaries(nodes)[0]).toContain('acme-future-shifter')
    const manifest = buildHardwareManifest(nodes, [], S3)
    const held = manifest.unsupportedItems.find((item) => item.kind === 'matrix-output')
    expect(held?.reasons?.join(' ')).toContain('acme-future-shifter')
    expect(manifest.primaryItems.some((item) => item.kind === 'matrix-output')).toBe(false)
    expect(() => generateCpp(nodes, [])).not.toThrow()
  })

  it('says nothing for Direct, an empty value, or the default shifter', () => {
    const nodes = [node('b', 'Board', { levelShifterPartId: '' }), output({ dataLinkPartId: '' })]
    expect(buildGraphDiagnostics(nodes, []).filter((entry) => entry.id.includes('unknown-part'))).toEqual([])
    expect(unresolvedPartSummaries(nodes)).toEqual([])
  })
})
