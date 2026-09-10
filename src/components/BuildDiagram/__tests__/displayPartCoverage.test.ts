import { describe, it, expect } from 'vitest'
import { MODULE_PAD_GEOMETRY, peripheralPadLabel, peripheralSignalPadIndex } from '../physicalDiagramLayout'
import { catalogueDisplays, partPinLabelForProperty } from '../../../state/partCatalogue'
import { partOptionsFor } from '../../../state/partOptions'
import { OLED_TRANSPORT_PINS, oledTransportFor } from '../../../state/oledSurface'
import { segmentControllerForProps, transportDisplayPinKeysForProps } from '../../../state/nodeLibrary'
import type { HardwareManifestItem } from '../../../build/hardwareManifest'

/*
 * A display arrives in three places that have to agree: the catalogue (what the
 * module is), a part menu (that anyone can choose it), and the measured pad
 * geometry (where its wires meet the picture). Each of those was forgotten at
 * least once — the four-pin SH1106 shipped with no geometry, so its wires were
 * spread evenly across the whole render instead of landing on its four holes.
 *
 * These derive their subject from the catalogue rather than listing part ids,
 * so a part imported tomorrow fails here until it is described, which is the
 * point: the alternative is a diagram that draws a plausible wrong picture.
 */

/** Every display node that offers a module, and how each names its pins. */
const DISPLAY_NODES: Array<{
  nodeType: string
  kind: HardwareManifestItem['kind']
  pinKeys: (partId: string) => readonly string[]
}> = [
  {
    nodeType: 'InfoDisplay',
    kind: 'info-display',
    pinKeys: (partId) => [...OLED_TRANSPORT_PINS[oledTransportFor(displayOf(partId).interface)]],
  },
  {
    nodeType: 'TransportDisplay',
    kind: 'transport-display',
    pinKeys: (partId) => transportDisplayPinKeysForProps({ partId }),
  },
  {
    nodeType: 'SegmentDisplay',
    kind: 'segment-display',
    pinKeys: (partId) => segmentControllerForProps({ partId }).pins,
  },
]

/*
 * Catalogued, rendered, and deliberately absent from every menu: the ILI9341
 * touch panel is modelled but not driven, and listing it would be a claim the
 * firmware cannot keep. Naming it here rather than skipping unoffered parts is
 * what makes a *newly* unoffered part a failure.
 */
const CATALOGUE_ONLY = ['ili9341-xpt2046-touch-320x240']

function displayOf(partId: string) {
  return catalogueDisplays().find((entry) => entry.partId === partId)!.display!
}

/** Every catalogued display that has a render to draw wires onto. */
const rendered = catalogueDisplays().filter((entry) => entry.render !== undefined)

function offeringNode(partId: string) {
  return DISPLAY_NODES.find((node) =>
    partOptionsFor(node.nodeType).some((option) => option.id === partId))
}

function itemFor(partId: string, node: { kind: HardwareManifestItem['kind']; pinKeys: (id: string) => readonly string[] }) {
  return {
    id: `${node.kind}:x`, kind: node.kind, title: node.kind, subtitle: '', sourceNodeId: 'x',
    supported: true, facts: { partId },
    pins: node.pinKeys(partId).map((propertyKey) => ({ propertyKey } as HardwareManifestItem['pins'][number])),
  } as HardwareManifestItem
}

describe('every catalogued display is fully described', () => {
  // A guard against the whole file passing vacuously if the catalogue import
  // ever comes back empty: every case below is generated from this list.
  it('has renders to measure', () => {
    expect(rendered.length).toBeGreaterThanOrEqual(9)
  })

  it.each(rendered.map((entry) => [entry.partId] as const))('measures %s pad geometry', (partId) => {
    const points = MODULE_PAD_GEOMETRY[partId]
    expect(points, `${partId} has a render but no measured pads — scan it for its plating`)
      .toBeDefined()
    expect(points.length).toBe(displayHeader(partId).length)
  })

  it.each(rendered.map((entry) => [entry.partId] as const))('offers %s in a part menu', (partId) => {
    const node = offeringNode(partId)
    if (CATALOGUE_ONLY.includes(partId)) {
      expect(node, `${partId} is listed catalogue-only but a menu now offers it`).toBeUndefined()
      return
    }
    expect(node, `${partId} is catalogued and rendered but no display menu offers it`)
      .toBeDefined()
  })

  /*
   * The defect this exists for: an I2C OLED whose silkscreen prints CLK and
   * DATA rather than SCL and SDA fell through to the SPI-ordered fallback and
   * drew SDA on the CS pad. Every line a display node claims has to land on the
   * pad the module prints for it, and no two on the same pad.
   */
  it.each(rendered.map((entry) => [entry.partId] as const))('wires %s to its own labels', (partId) => {
    const node = offeringNode(partId)
    if (!node) return
    const item = itemFor(partId, node)
    const header = displayHeader(partId)
    const landed = item.pins.map((_, index) => peripheralSignalPadIndex(item, index))

    item.pins.forEach((usePin, index) => {
      const label = partPinLabelForProperty(partId, usePin.propertyKey)
      expect(label, `${partId} prints no pad for ${usePin.propertyKey}`).not.toBeNull()
      expect(peripheralPadLabel(item, landed[index]), `${partId} ${usePin.propertyKey}`).toBe(label)
    })
    expect(new Set(landed).size, `${partId} puts two signals on one pad`).toBe(landed.length)
    expect(Math.max(...landed)).toBeLessThan(header.length)
  })
})

function displayHeader(partId: string): readonly string[] {
  return catalogueDisplays().find((entry) => entry.partId === partId)!.pinLabelsLeftToRight ?? []
}
