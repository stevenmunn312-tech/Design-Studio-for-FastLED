import { describe, expect, it } from 'vitest'
import { collectPinUses } from '../../build/hardwareManifest'
import type { StudioNode } from '../graphStore'
import { isHardwareLibraryHiddenNodeType, isHardwareManagedSignalNodeType, isHardwareNodeType } from '../hardware'
import {
  NODE_LIBRARY, isGpioPinProperty, isPropertyEnabled, libraryDefaults,
  oledControllerForProps, propertyMeta, segmentControllerForProps, tftControllerForProps,
} from '../nodeLibrary'
import { PART_FIELDS } from '../partFields'
import { displayResolution, partById } from '../partCatalogue'
import { partOptionsFor } from '../partOptions'
import { PART_PIN_PLANS } from '../pinRetarget'

// Derive the inventory from real module choices: a newly offered display must
// satisfy the same ownership, driver and inspector contracts automatically.
// `Display` (the document node) is deliberately not part of this derivation
// any more — since the panel/document split it selects no module of its own,
// so it has nothing for `partOptionsFor` to find. Its own contract is tested
// directly below instead.
const displays = NODE_LIBRARY.filter((node) => partOptionsFor(node.type)
  .some((option) => partById(option.id)?.display))
const modules = displays.flatMap((node) => partOptionsFor(node.type)
  .map((option) => ({ nodeType: node.type, partId: option.id })))

function moduleNode(nodeType: string, partId: string): StudioNode {
  const definition = NODE_LIBRARY.find((node) => node.type === nodeType)!
  return {
    id: 'panel', type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      inputs: definition.inputs, outputs: definition.outputs,
      properties: { ...libraryDefaults(nodeType), partId },
    },
  }
}

describe('display node registration contracts', () => {
  it('includes every fixed, module-selecting display', () => {
    expect(displays.map((node) => node.type).sort())
      .toEqual(['InfoDisplay', 'SegmentDisplay', 'TransportDisplay'])
  })

  it.each(displays)('$type starts with a real offered module and belongs to the workbench', (node) => {
    expect(isHardwareNodeType(node.type)).toBe(true)
    expect(isHardwareManagedSignalNodeType(node.type)).toBe(true)
    expect(isHardwareLibraryHiddenNodeType(node.type)).toBe(true)
    expect(partOptionsFor(node.type).map((option) => option.id))
      .toContain(libraryDefaults(node.type).partId)
    expect(libraryDefaults(node.type).enabled).toBe(true)
  })

  it.each(modules)('$nodeType / $partId has a driver for its actual glass', ({ nodeType, partId }) => {
    const props = moduleNode(nodeType, partId).data.properties
    const spec = partById(partId)!.display!
    const driver = nodeType === 'SegmentDisplay' ? segmentControllerForProps(props)
      : nodeType === 'InfoDisplay' ? oledControllerForProps(props) : tftControllerForProps(props)
    expect(driver, partId).not.toBeNull()
    expect(spec.controller.toUpperCase()).toContain(driver!.id.toUpperCase())
    if (driver && 'width' in driver) {
      expect({ width: driver.width, height: driver.height }).toEqual(displayResolution(partId))
    }
  })

  it.each(modules)('$nodeType / $partId exposes and retargets exactly the pins it claims', ({ nodeType, partId }) => {
    const node = moduleNode(nodeType, partId)
    const props = node.data.properties
    const claimed = collectPinUses([node]).map((pin) => pin.propertyKey).sort()
    const editable = Object.keys(props).filter((key) =>
      isGpioPinProperty(nodeType, key) && isPropertyEnabled(nodeType, key, props)).sort()
    expect(editable).toEqual(claimed)
    for (const key of claimed) {
      expect(PART_PIN_PLANS[nodeType].keys, key).toContain(key)
      if (PART_FIELDS[nodeType]) {
        expect(PART_FIELDS[nodeType].filter((field) => field.kind === 'pin').map((field) => field.key), key)
          .toContain(key)
      }
    }
  })

  it.each(displays)('$type starts inside its editable property ranges', (node) => {
    const defaults = libraryDefaults(node.type)
    for (const [key, value] of Object.entries(defaults)) {
      const meta = propertyMeta(node.type, key)
      if (!meta || !isPropertyEnabled(node.type, key, defaults)) continue
      if (meta.control === 'select') expect(meta.options, `${node.type}.${key}`).toContain(value)
      if (meta.control === 'slider') {
        expect(value, key).toBeGreaterThanOrEqual(meta.min)
        expect(value, key).toBeLessThanOrEqual(meta.max)
      }
    }
  })

  it('keeps custom ports document-driven and leaves fixed layouts and pins on the Display Panel', () => {
    // Looked up directly, not through `displays` above — Display selects no
    // module of its own any more, so it never appears in that derivation.
    const definition = NODE_LIBRARY.find((node) => node.type === 'Display')!
    expect(definition.inputs).toEqual([])
    // One static output, the wire a TransportDisplay panel's `customDisplay`
    // input accepts. Every other port stays widget-derived.
    expect(definition.outputs).toEqual([{ id: 'customDisplay', label: 'Screen Design', dataType: 'customdisplay' }])
    expect(definition.defaultProperties).not.toHaveProperty('tftLayout')
    // No pins, no partId, no physical existence at all — just which document
    // this node opens.
    expect(definition.defaultProperties).toEqual({ displayId: '' })
    expect(partOptionsFor(definition.type)).toEqual([])
  })
})
